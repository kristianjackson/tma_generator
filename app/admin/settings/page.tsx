import Link from "next/link";

export default function AdminSettingsPage() {
  return (
    <main className="page">
      <section className="hero">
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
            <li>Audit trail for admin changes</li>
          </ul>
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
