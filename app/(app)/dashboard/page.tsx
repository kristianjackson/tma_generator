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
          <h2>Current Status</h2>
          <ul>
            <li>Generation pipeline: outline → draft → review/finalize</li>
            <li>Revision history with restore controls</li>
            <li>Export / share tools (txt/markdown, copy)</li>
            <li>Usage limits + per-user tier controls (Free / Pro / Superfan)</li>
            <li>Team management controls (claim admin, promote/demote, bulk updates)</li>
            <li>Ingestion loading indicator + pagination jump controls</li>
            <li>Step 3 now includes an always-visible full draft generation button</li>
            <li>Draft generation now rejects outline/script output and retries for prose</li>
            <li>Deploy retry wrapper added for transient Cloudflare deploy API failures</li>
          </ul>
        </div>
        <div className="card">
          <h2>Manual Next Steps</h2>
          <ul>
            <li>Run one production generation cycle: Step 1 → Step 2 → Step 3 → Review</li>
            <li>Confirm Step 3 output is full prose (not outline format)</li>
            <li>Save final from Review and verify it appears in run history as Finalized</li>
            <li>Verify deploy command in Cloudflare is set to `sh scripts/deploy-with-retry.sh`</li>
            <li>Complete AI metadata for all episodes, then spot-check fear tagging outliers</li>
          </ul>
        </div>
        <div className="card">
          <h2>Phase 3 Remaining Scope</h2>
          <ul>
            <li>Improve fear precision (bias to 1-2 fears, 0-3 max) on metadata suggestions</li>
            <li>Tune retrieval/context so generation uses corpus style without plot leakage</li>
            <li>Add admin progress view for long-running metadata batch jobs</li>
            <li>Verify per-tier run limits against multiple real users in production</li>
            <li>Harden generation UX notices for all AI failure categories</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
