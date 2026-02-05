export default function DashboardPage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Dashboard</p>
        <h1>Your workspace</h1>
        <p className="subhead">
          This area is protected by Clerk. Sign in to see your workspace.
        </p>
        <div className="card">
          <h2>Planned Modules</h2>
          <ul>
            <li>Re-run transcript cleanup + rechunk import into D1</li>
            <li>Re-run AI metadata tagging (0–3 fears) and review results</li>
            <li>Verify ingestion UI layout + loading indicator</li>
            <li>Generation pipeline: outline → draft → review/finalize</li>
            <li>Revision history with restore controls</li>
            <li>Export / share tools (txt/markdown, copy)</li>
            <li>Usage limits + per-user tiers verification</li>
            <li>Team management</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
