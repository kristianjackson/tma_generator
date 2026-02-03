import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";

type SearchParams = {
  page?: string;
  q?: string;
};

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

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const { userId } = await auth();
  const client = await clerkClient();
  const page = getPage(searchParams?.page);
  const query = searchParams?.q?.trim() ?? "";
  const limit = 20;
  const offset = (page - 1) * limit;
  const usersResponse = await client.users.getUserList({
    limit,
    offset,
    orderBy: "created_at"
  });
  const users = Array.isArray(usersResponse)
    ? usersResponse
    : usersResponse.data;
  const totalCount = Array.isArray(usersResponse)
    ? usersResponse.length
    : usersResponse.totalCount ?? usersResponse.data.length;
  const sortedUsers = [...users].sort((a, b) => b.createdAt - a.createdAt);
  const filteredUsers = query
    ? sortedUsers.filter((user) => {
        const emailAddresses = user.emailAddresses
          .map((address: { emailAddress: string }) =>
            address.emailAddress.toLowerCase()
          )
          .join(" ");
        const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`
          .trim()
          .toLowerCase();
        const username = user.username?.toLowerCase() ?? "";
        const haystack = `${fullName} ${emailAddresses} ${username}`;
        return haystack.includes(query.toLowerCase());
      })
    : sortedUsers;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Admin</p>
        <h1>User Directory</h1>
        <p className="subhead">
          Showing users {offset + 1}–{offset + filteredUsers.length} of{" "}
          {totalCount}. Current user: {userId}
        </p>
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
            Search filters within the current page of results.
          </p>
        </div>
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Last Sign-In</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const primaryEmail =
                  user.emailAddresses.find(
                    (address) => address.id === user.primaryEmailAddressId
                  )?.emailAddress ??
                  user.emailAddresses[0]?.emailAddress ??
                  "—";
                const displayName =
                  user.firstName || user.lastName
                    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                    : "—";

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="avatar">
                        <img src={user.imageUrl} alt={displayName} />
                      </div>
                    </td>
                    <td>{user.id}</td>
                    <td>{displayName}</td>
                    <td>{primaryEmail}</td>
                    <td>{formatDate(user.lastSignInAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
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
