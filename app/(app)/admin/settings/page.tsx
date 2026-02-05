import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, requireDb } from "@/app/lib/db";
import {
  formatDailyLimit,
  getDefaultDailyLimit,
  parseDailyLimitValue
} from "@/app/lib/limits";
import { getDisplayName, getPrimaryEmail } from "@/app/lib/user-utils";
import { isUserAdmin } from "../admin-utils";
import { appendAuditEntry, listAuditEntries } from "../audit-log";

type SearchParams = {
  notice?: string | string[];
};

type LimitOverride = {
  user_id: string;
  daily_limit: number;
  tier?: string | null;
  updated_at: number;
  displayName?: string;
  email?: string | null;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const addNotice = (url: string, notice: string) => {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}notice=${notice}`;
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

const requireAdmin = async () => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const client = await clerkClient();
  const currentUser = await client.users.getUser(userId);
  if (!isUserAdmin(currentUser)) {
    redirect("/dashboard");
  }

  return { userId, client, currentUser };
};

const updateGlobalLimitAction = async (formData: FormData) => {
  "use server";

  const { userId, currentUser } = await requireAdmin();
  const returnTo = String(formData.get("returnTo") ?? "/admin/settings");
  const rawLimit = String(formData.get("global_limit") ?? "").trim();
  const parsedLimit = parseDailyLimitValue(rawLimit);

  if (parsedLimit === null) {
    redirect(addNotice(returnTo, "invalid-limit"));
  }

  const db = requireDb();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind("run_daily_limit", String(parsedLimit), now)
    .run();

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(currentUser),
    action: "set_global_run_limit",
    targetId: "run_daily_limit",
    targetName: String(parsedLimit),
    createdAt: now
  });

  revalidatePath("/admin/settings");
  redirect(addNotice(returnTo, "global-updated"));
};

const clearGlobalLimitAction = async (formData: FormData) => {
  "use server";

  const { userId, currentUser } = await requireAdmin();
  const returnTo = String(formData.get("returnTo") ?? "/admin/settings");
  const db = requireDb();
  const now = Date.now();

  await db
    .prepare("DELETE FROM app_settings WHERE key = ?")
    .bind("run_daily_limit")
    .run();

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(currentUser),
    action: "clear_global_run_limit",
    targetId: "run_daily_limit",
    targetName: "env_default",
    createdAt: now
  });

  revalidatePath("/admin/settings");
  redirect(addNotice(returnTo, "global-cleared"));
};

const saveUserLimitAction = async (formData: FormData) => {
  "use server";

  const { userId, currentUser } = await requireAdmin();
  const returnTo = String(formData.get("returnTo") ?? "/admin/settings");
  const targetUserId = String(formData.get("target_user_id") ?? "").trim();
  const rawLimit = String(formData.get("user_limit") ?? "").trim();
  const tier = String(formData.get("tier") ?? "").trim() || null;
  const parsedLimit = parseDailyLimitValue(rawLimit);

  if (!targetUserId) {
    redirect(addNotice(returnTo, "missing-user"));
  }

  if (parsedLimit === null) {
    redirect(addNotice(returnTo, "invalid-limit"));
  }

  const db = requireDb();
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO user_limits (user_id, daily_limit, tier, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET daily_limit = excluded.daily_limit, tier = excluded.tier, updated_at = excluded.updated_at"
    )
    .bind(targetUserId, parsedLimit, tier, now)
    .run();

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(currentUser),
    action: "set_user_run_limit",
    targetId: targetUserId,
    targetName: `${parsedLimit}${tier ? ` (${tier})` : ""}`,
    createdAt: now
  });

  revalidatePath("/admin/settings");
  redirect(addNotice(returnTo, "user-updated"));
};

const removeUserLimitAction = async (formData: FormData) => {
  "use server";

  const { userId, currentUser } = await requireAdmin();
  const returnTo = String(formData.get("returnTo") ?? "/admin/settings");
  const targetUserId = String(formData.get("target_user_id") ?? "").trim();

  if (!targetUserId) {
    redirect(returnTo);
  }

  const db = requireDb();
  const now = Date.now();
  await db.prepare("DELETE FROM user_limits WHERE user_id = ?").bind(targetUserId).run();

  await appendAuditEntry({
    id: crypto.randomUUID(),
    actorId: userId,
    actorName: getDisplayName(currentUser),
    action: "remove_user_run_limit",
    targetId: targetUserId,
    targetName: "deleted",
    createdAt: now
  });

  revalidatePath("/admin/settings");
  redirect(addNotice(returnTo, "user-removed"));
};

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);

  const { client } = await requireAdmin();

  const db = getDb();
  const defaultLimit = getDefaultDailyLimit();
  let dbReady = true;
  let globalLimit = defaultLimit;
  let globalOverride = false;
  let globalUpdatedAt: number | null = null;
  let overrides: LimitOverride[] = [];

  if (!db) {
    dbReady = false;
  } else {
    try {
      const globalRow = await db
        .prepare("SELECT value, updated_at FROM app_settings WHERE key = ?")
        .bind("run_daily_limit")
        .first<{ value?: string | null; updated_at?: number | null }>();
      const parsedGlobal = parseDailyLimitValue(globalRow?.value ?? null);
      if (parsedGlobal !== null) {
        globalLimit = parsedGlobal;
        globalOverride = true;
        globalUpdatedAt = globalRow?.updated_at ?? null;
      }

      const rows = await db
        .prepare(
          "SELECT user_id, daily_limit, tier, updated_at FROM user_limits ORDER BY updated_at DESC"
        )
        .all<LimitOverride>();
      overrides = rows.results ?? [];
    } catch {
      dbReady = false;
      overrides = [];
      globalLimit = defaultLimit;
    }
  }

  const enrichedOverrides = await Promise.all(
    overrides.map(async (override) => {
      try {
        const user = await client.users.getUser(override.user_id);
        return {
          ...override,
          displayName: getDisplayName(user),
          email: getPrimaryEmail(user)
        };
      } catch {
        return {
          ...override,
          displayName: override.user_id,
          email: null
        };
      }
    })
  );

  const { entries, configured } = await listAuditEntries(30);
  const returnTo = "/admin/settings";

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin Settings</p>
        <h1>Roles & permissions</h1>
        <p className="subhead">
          Control daily generator run limits globally or per user. Overrides are
          applied before the environment default.
        </p>

        {notice === "global-updated" ? (
          <p className="notice">Global run limit updated.</p>
        ) : null}
        {notice === "global-cleared" ? (
          <p className="notice">Global run limit cleared. Using env default.</p>
        ) : null}
        {notice === "user-updated" ? (
          <p className="notice">User limit saved.</p>
        ) : null}
        {notice === "user-removed" ? (
          <p className="notice">User limit removed.</p>
        ) : null}
        {notice === "invalid-limit" ? (
          <p className="notice">
            Provide a valid number for the daily limit. Use 0 for unlimited.
          </p>
        ) : null}
        {notice === "missing-user" ? (
          <p className="notice">Add a user ID before saving an override.</p>
        ) : null}

        {!dbReady ? (
          <div className="card">
            <h2>Run limits</h2>
            <p className="subhead">
              D1 is not configured. Add the `DB` binding and run the migrations
              to enable run limits.
            </p>
          </div>
        ) : (
          <>
            <div className="card">
              <h2>Global run limit</h2>
              <p className="subhead">
                Current limit: {formatDailyLimit(globalLimit)}{" "}
                {globalOverride ? "(admin override)" : "(env default)"}.
              </p>
              {globalUpdatedAt ? (
                <p className="hint">Last updated: {formatDate(globalUpdatedAt)}</p>
              ) : null}
              <form className="form" action={updateGlobalLimitAction}>
                <label className="form-label" htmlFor="global_limit">
                  Daily limit (0 = unlimited)
                </label>
                <input
                  id="global_limit"
                  name="global_limit"
                  type="number"
                  className="input"
                  min={0}
                  defaultValue={globalLimit}
                />
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="actions">
                  <button className="primary" type="submit">
                    Save global limit
                  </button>
                  <button className="ghost" formAction={clearGlobalLimitAction}>
                    Reset to env default
                  </button>
                </div>
              </form>
            </div>

            <div className="card table-card">
              <h2>User run overrides</h2>
              <p className="subhead">
                Overrides apply before the global limit. Use 0 for unlimited.
              </p>
              <form className="form" action={saveUserLimitAction}>
                <label className="form-label" htmlFor="target_user_id">
                  User ID
                </label>
                <input
                  id="target_user_id"
                  name="target_user_id"
                  className="input"
                  placeholder="user_123..."
                />
                <label className="form-label" htmlFor="user_limit">
                  Daily limit
                </label>
                <input
                  id="user_limit"
                  name="user_limit"
                  type="number"
                  className="input"
                  min={0}
                />
                <label className="form-label" htmlFor="tier">
                  Tier label (optional)
                </label>
                <input id="tier" name="tier" className="input" placeholder="pro" />
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="actions">
                  <button className="primary" type="submit">
                    Save override
                  </button>
                </div>
              </form>

              {enrichedOverrides.length === 0 ? (
                <p className="subhead">No user overrides yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Limit</th>
                      <th>Tier</th>
                      <th>Updated</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedOverrides.map((override) => (
                      <tr key={override.user_id}>
                        <td>
                          <div>{override.displayName ?? override.user_id}</div>
                          <div className="hint">{override.email ?? override.user_id}</div>
                        </td>
                        <td>{formatDailyLimit(override.daily_limit)}</td>
                        <td>{override.tier ?? "—"}</td>
                        <td>{formatDate(override.updated_at)}</td>
                        <td>
                          <form action={removeUserLimitAction}>
                            <input
                              type="hidden"
                              name="target_user_id"
                              value={override.user_id}
                            />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button className="ghost" type="submit">
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div className="card table-card">
          <h2>Audit log</h2>
          {!configured ? (
            <p className="subhead">
              Audit logging is not configured yet. Add a KV namespace binding
              called `AUDIT_LOG` in `wrangler.jsonc` and Cloudflare.
            </p>
          ) : entries.length === 0 ? (
            <p className="subhead">No admin events recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString("en-US")}</td>
                    <td>{entry.action}</td>
                    <td>{entry.actorName}</td>
                    <td>{entry.targetName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="actions">
          <Link className="primary link-button" href="/admin">
            Back to admin
          </Link>
          <Link className="ghost link-button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
