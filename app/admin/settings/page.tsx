import Link from "next/link";
import { listAuditEntries } from "../audit-log";

export default async function AdminSettingsPage() {
  const { entries, configured } = await listAuditEntries(30);

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin Settings</p>
        <h1>Roles & permissions</h1>
        <p className="subhead">
          This area is reserved for upcoming role and permission management. For
          now, admin access is managed on the user list.
        </p>
        <div className="card">
          <h2>Coming soon</h2>
          <ul>
            <li>Role presets for common workflows</li>
            <li>Per-feature permissions</li>
            <li>Custom approval workflows</li>
          </ul>
        </div>
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
