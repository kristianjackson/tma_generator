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
            <li>New TMA Generation</li>
            <li>Phase 3: Generation pipeline polish (auto + regenerate)</li>
            <li>Phase 3: Revision history + restore controls</li>
            <li>Phase 3: Export / share tools (txt/markdown, copy)</li>
            <li>Phase 3: Usage limits + cost guardrails</li>
            <li>Team management</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
