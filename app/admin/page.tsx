import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasAnyAdmin, isUserAdmin } from "./admin-utils";
import { appendAuditEntry } from "./audit-log";
import { getDisplayName, getPrimaryEmail } from "../lib/user-utils";

type ClerkUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl: string;
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId?: string | null;
  lastSignInAt?: number | null;
  createdAt: number;
  privateMetadata?: Record<string, unknown>;
};

type UserListResponse = {
  data: ClerkUser[];
  totalCount?: number;
};

type SearchParams = {
  page?: string | string[];
  q?: string | string[];
  notice?: string | string[];
};

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

const formatDate = (value?: number | null) => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const getPage = (value?: string) => {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const normalizeUserList = (response: UserListResponse | ClerkUser[]) => {
  const users = Array.isArray(response) ? response : response.data;
  const totalCount = Array.isArray(response) ? undefined : response.totalCount;
  return { users, totalCount };
};

const matchesQuery = (user: ClerkUser, query: string) => {
  const emailAddresses = user.emailAddresses
    .map((address) => address.emailAddress.toLowerCase())
    .join(" ");
  const displayName = getDisplayName(user).toLowerCase();
  const username = user.username?.toLowerCase() ?? "";
  const haystack = `${displayName} ${emailAddresses} ${username}`;
  return haystack.includes(query.toLowerCase());
};

const fetchAllUsers = async (client: ClerkClient) => {
  const users: ClerkUser[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await client.users.getUserList({
      limit,
      offset,
      orderBy: "created_at"
    });
    const { users: batch, totalCount } = normalizeUserList(response);

    if (batch.length === 0) {
      break;
    }

    users.push(...batch);
    offset += limit;

    if (typeof totalCount === "number" && offset >= totalCount) {
      break;
    }

    if (typeof totalCount !== "number" && batch.length < limit) {
      break;
    }
  }

  return users;
};

const fetchUsersPage = async (
  client: ClerkClient,
  options: { page: number; limit: number }
) => {
  const { page, limit } = options;
  const offset = (page - 1) * limit;
  const response = await client.users.getUserList({
    limit,
    offset,
    orderBy: "created_at"
  });
  const { users, totalCount } = normalizeUserList(response);
  const sortedUsers = [...users].sort((a, b) => b.createdAt - a.createdAt);
  const resolvedTotal = totalCount ?? offset + users.length;

  return { users: sortedUsers, totalCount: resolvedTotal };
};

const fetchUsersSearch = async (
  client: ClerkClient,
  options: { page: number; limit: number; query: string }
) => {
  const { page, limit, query } = options;
  const allUsers = await fetchAllUsers(client);
  const matches = allUsers.filter((user) => matchesQuery(user, query));
  matches.sort((a, b) => b.createdAt - a.createdAt);

  const offset = (page - 1) * limit;
  const users = matches.slice(offset, offset + limit);

  return { users, totalCount: matches.length };
};

const buildReturnUrl = (page: number, query: string) => {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (query) {
    params.set("q", query);
  }

  const queryString = params.toString();
  return queryString ? `/admin?${queryString}` : "/admin";
};

const addNotice = (url: string, notice: string) => {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}notice=${notice}`;
};

const updateAdminAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const client = await clerkClient();
  const currentUser = await client.users.getUser(userId);

  if (!isUserAdmin(currentUser)) {
    redirect("/dashboard");
  }

  const targetUserId = String(formData.get("userId") ?? "");
  const makeAdmin = formData.get("makeAdmin") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/admin");

  if (!targetUserId) {
    redirect(returnTo);
  }

  if (!makeAdmin) {
    const hasOtherAdmins = await hasAnyAdmin(client, {
      excludeUserIds: [targetUserId]
    });

    if (!hasOtherAdmins) {
      redirect(addNotice(returnTo, "last-admin"));
    }
  }

  const targetUser = await client.users.getUser(targetUserId);
  await client.users.updateUser(targetUserId, {
    privateMetadata: {
      ...(targetUser.privateMetadata ?? {}),
      isAdmin: makeAdmin,
      role: makeAdmin ? "admin" : "member"
    }
  });

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(currentUser),
    action: makeAdmin ? "grant_admin" : "revoke_admin",
    targetId: targetUserId,
    targetName: getDisplayName(targetUser),
    createdAt: Date.now()
  });

  revalidatePath("/admin");
  redirect(returnTo);
};

const bulkUpdateAdminAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const client = await clerkClient();
  const currentUser = await client.users.getUser(userId);

  if (!isUserAdmin(currentUser)) {
    redirect("/dashboard");
  }

  const returnTo = String(formData.get("returnTo") ?? "/admin");
  const action = String(formData.get("bulkAction") ?? "");
  const selectedIds = formData
    .getAll("selectedUserIds")
    .map((value) => String(value))
    .filter(Boolean);

  if (selectedIds.length === 0) {
    redirect(addNotice(returnTo, "no-selection"));
  }

  const makeAdmin = action === "make-admin" ? true : action === "remove-admin" ? false : null;

  if (makeAdmin === null) {
    redirect(addNotice(returnTo, "invalid-action"));
  }

  if (!makeAdmin) {
    const hasOtherAdmins = await hasAnyAdmin(client, {
      excludeUserIds: selectedIds
    });

    if (!hasOtherAdmins) {
      redirect(addNotice(returnTo, "last-admin"));
    }
  }

  const updatedUsers = await Promise.all(
    selectedIds.map(async (targetUserId) => {
      const targetUser = await client.users.getUser(targetUserId);
      await client.users.updateUser(targetUserId, {
        privateMetadata: {
          ...(targetUser.privateMetadata ?? {}),
          isAdmin: makeAdmin,
          role: makeAdmin ? "admin" : "member"
        }
      });
      return targetUser;
    })
  );

  await Promise.all(
    updatedUsers.map((targetUser) =>
      appendAuditEntry({
        id: crypto.randomUUID(),
        actorId: userId,
        actorName: getDisplayName(currentUser),
        action: makeAdmin ? "grant_admin" : "revoke_admin",
        targetId: targetUser.id,
        targetName: getDisplayName(targetUser),
        createdAt: Date.now()
      })
    )
  );

  revalidatePath("/admin");
  redirect(returnTo);
};

const claimAdminAction = async () => {
  "use server";

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const client = await clerkClient();
  const anyAdmin = await hasAnyAdmin(client);

  if (anyAdmin) {
    redirect("/dashboard");
  }

  const user = await client.users.getUser(userId);
  await client.users.updateUser(userId, {
    privateMetadata: {
      ...(user.privateMetadata ?? {}),
      isAdmin: true,
      role: "admin"
    }
  });

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(user),
    action: "claim_admin",
    targetId: userId,
    targetName: getDisplayName(user),
    createdAt: Date.now()
  });

  revalidatePath("/admin");
  redirect("/admin");
};

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  const client = await clerkClient();
  const currentUser = userId ? await client.users.getUser(userId) : null;
  const isAdmin = currentUser ? isUserAdmin(currentUser) : false;
  const currentUserName = currentUser ? getDisplayName(currentUser) : "Unknown user";
  const resolvedSearchParams = await searchParams;
  const page = getPage(getFirstValue(resolvedSearchParams?.page));
  const query = getFirstValue(resolvedSearchParams?.q)?.trim() ?? "";
  const notice = getFirstValue(resolvedSearchParams?.notice);

  if (!isAdmin) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Admin Setup</p>
          <h1>Claim admin access</h1>
          <p className="subhead">
            No admins exist yet. The first signed-in user can claim admin access
            to unlock the user management module.
          </p>
          <div className="actions">
            <form action={claimAdminAction}>
              <button className="primary" type="submit">
                Claim admin access
              </button>
            </form>
            <Link className="ghost link-button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const limit = 20;
  const returnTo = buildReturnUrl(page, query);
  const { users: filteredUsers, totalCount } = query
    ? await fetchUsersSearch(client, { page, limit, query })
    : await fetchUsersPage(client, { page, limit });
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const filteredCount = filteredUsers.length;
  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = (page - 1) * limit + filteredCount;
  const labelSuffix = query ? " matching users." : " users.";
  const rangeLabel =
    filteredCount === 0
      ? `Showing 0 of ${totalCount}${labelSuffix}`
      : `Showing users ${rangeStart}–${rangeEnd} of ${totalCount}${labelSuffix}`;
  const noticeMessage =
    notice === "last-admin"
      ? "You cannot remove the last remaining admin."
      : notice === "no-selection"
        ? "Select at least one user for bulk actions."
        : notice === "invalid-action"
          ? "Choose a bulk action to apply."
          : null;

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin</p>
        <div className="admin-header">
          <h1>User Directory</h1>
          <div className="admin-actions">
            <Link className="ghost link-button" href="/admin/ingestion">
              Transcript ingestion
            </Link>
            <Link className="ghost link-button" href="/admin/settings">
              Admin settings
            </Link>
          </div>
        </div>
        <p className="subhead">{rangeLabel} Current user: {currentUserName}</p>
        {noticeMessage ? <p className="notice">{noticeMessage}</p> : null}
        <div className="toolbar">
          <form className="search" action="/admin" method="get">
            <input
              className="input"
              type="search"
              name="q"
              placeholder="Search name, email, username"
              defaultValue={query}
            />
            <button className="primary" type="submit">
              Search
            </button>
          </form>
          <p className="hint">
            Search scans the full directory. Bulk actions apply to the selected
            users below.
          </p>
        </div>
        <form
          id="bulk-admin-form"
          className="bulk-actions"
          action={bulkUpdateAdminAction}
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="bulk-label" htmlFor="bulkAction">
            Bulk action
          </label>
          <select id="bulkAction" name="bulkAction" className="select">
            <option value="">Choose an action</option>
            <option value="make-admin">Make admin</option>
            <option value="remove-admin">Remove admin</option>
          </select>
          <button className="primary" type="submit">
            Apply to selected
          </button>
        </form>
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Select</span>
                </th>
                <th>Profile</th>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Last Sign-In</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const primaryEmail = getPrimaryEmail(user);
                const displayName = getDisplayName(user);
                const isRowAdmin = isUserAdmin(user);
                const makeAdmin = isRowAdmin ? "false" : "true";
                const actionLabel = isRowAdmin ? "Remove admin" : "Make admin";
                const roleLabel = isRowAdmin ? "Admin" : "Member";

                return (
                  <tr key={user.id}>
                    <td>
                      <input
                        className="checkbox"
                        type="checkbox"
                        name="selectedUserIds"
                        value={user.id}
                        form="bulk-admin-form"
                        aria-label={`Select ${displayName}`}
                      />
                    </td>
                    <td>
                      <div className="avatar">
                        <img src={user.imageUrl} alt={displayName} />
                      </div>
                    </td>
                    <td>{user.id}</td>
                    <td>{displayName}</td>
                    <td>{primaryEmail}</td>
                    <td>{roleLabel}</td>
                    <td>{formatDate(user.lastSignInAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <form className="inline-form" action={updateAdminAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="makeAdmin"
                          value={makeAdmin}
                        />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button className="ghost small-button" type="submit">
                          {actionLabel}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <Link
            className="ghost link-button"
            href={`/admin?page=${Math.max(1, page - 1)}&q=${encodeURIComponent(
              query
            )}`}
          >
            Previous
          </Link>
          <span className="page-count">
            Page {page} of {totalPages}
          </span>
          <Link
            className="ghost link-button"
            href={`/admin?page=${Math.min(totalPages, page + 1)}&q=${encodeURIComponent(
              query
            )}`}
          >
            Next
          </Link>
        </div>
      </section>
    </main>
  );
}
