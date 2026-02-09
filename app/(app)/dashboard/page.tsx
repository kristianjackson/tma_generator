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
          <h2>Phase 3: Implemented</h2>
          <ul>
            <li>Generation pipeline: outline → draft → review/finalize</li>
            <li>Revision history with restore controls</li>
            <li>Export / share tools (txt/markdown, copy)</li>
            <li>Usage limits + per-user tier controls (Free / Pro / Superfan)</li>
            <li>Team management controls (claim admin, promote/demote, bulk updates)</li>
            <li>Ingestion loading indicators and bulk AI metadata flow</li>
          </ul>
        </div>
        <div className="card">
          <h2>Phase 3: Pending Verification</h2>
          <ul>
            <li>Re-run transcript cleanup + rechunk import into D1</li>
            <li>Re-run AI metadata tagging for all episodes and review outliers</li>
            <li>Verify ingestion layout on production after latest CSS updates</li>
            <li>Run one full end-to-end generation cycle on production</li>
            <li>Verify limits behavior by tier on live users</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
