import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { requireDb } from "@/app/lib/db";

type RunRow = {
  id: string;
  seed: string;
  status: string;
  filters_json: string | null;
};

type VersionRow = {
  version_type: string;
  content: string;
  created_at: number;
};

export default async function RunDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">History</p>
          <h1>Sign in required</h1>
        </section>
      </main>
    );
  }

  const resolvedParams = await params;
  const db = requireDb();
  const run = await db
    .prepare(
      "SELECT id, seed, status, filters_json FROM story_runs WHERE id = ? AND user_id = ?"
    )
    .bind(resolvedParams.id, userId)
    .first<RunRow>();

  if (!run) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">History</p>
          <h1>Run not found</h1>
          <div className="actions">
            <Link className="primary link-button" href="/runs">
              Back to runs
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const versions = await db
    .prepare(
      "SELECT version_type, content, created_at FROM story_versions WHERE run_id = ? ORDER BY created_at DESC"
    )
    .bind(run.id)
    .all<VersionRow>();

  const filters = run.filters_json ? JSON.parse(run.filters_json) : {};

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">History</p>
        <div className="admin-header">
          <h1>Run detail</h1>
          <Link className="ghost link-button" href="/runs">
            Back to runs
          </Link>
        </div>
        <p className="subhead">Seed: {run.seed}</p>
        <div className="card">
          <h2>Filters</h2>
          <pre className="code-block">
            {JSON.stringify(filters, null, 2)}
          </pre>
        </div>
        {versions.results.length === 0 ? (
          <p className="subhead">No saved versions yet.</p>
        ) : (
          versions.results.map((version) => (
            <div key={version.created_at} className="card">
              <h2>{version.version_type.toUpperCase()}</h2>
              <pre className="code-block">{version.content}</pre>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
