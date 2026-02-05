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
import { getDisplayName } from "@/app/lib/user-utils";
import { TIER_PRESETS } from "@/app/lib/tiers";
import { isUserAdmin } from "../admin-utils";
import { appendAuditEntry, listAuditEntries } from "../audit-log";

type SearchParams = {
  notice?: string | string[];
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

  return { userId, currentUser };
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

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);

  await requireAdmin();

  const db = getDb();
  const defaultLimit = getDefaultDailyLimit();
  let dbReady = true;
  let globalLimit = defaultLimit;
  let globalOverride = false;
  let globalUpdatedAt: number | null = null;

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

    } catch {
      dbReady = false;
      globalLimit = defaultLimit;
    }
  }

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
        {notice === "invalid-limit" ? (
          <p className="notice">
            Provide a valid number for the daily limit. Use 0 for unlimited.
          </p>
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

            <div className="card">
              <h2>User tiers</h2>
              <p className="subhead">
                Per-user run limits are managed on the User Directory screen.
              </p>
              <ul>
                {TIER_PRESETS.map((preset) => (
                  <li key={preset.id}>
                    {preset.label}: {formatDailyLimit(preset.limit)} runs/day
                  </li>
                ))}
              </ul>
              <div className="actions">
                <Link className="ghost link-button" href="/admin">
                  Manage users
                </Link>
              </div>
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
