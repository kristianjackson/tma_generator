import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { requireDb } from "../lib/db";

type RunRow = {
  id: string;
  seed: string;
  status: string;
  created_at: number;
  updated_at: number;
};

export default async function RunsPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">History</p>
          <h1>Sign in required</h1>
          <p className="subhead">Please sign in to view your runs.</p>
        </section>
      </main>
    );
  }

  const db = requireDb();
  const result = await db
    .prepare(
      "SELECT id, seed, status, created_at, updated_at FROM story_runs WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .bind(userId)
    .all<RunRow>();

  const runs = result.results;

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">History</p>
        <div className="admin-header">
          <h1>Saved runs</h1>
          <Link className="ghost link-button" href="/generate/step-1">
            New run
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="subhead">No runs saved yet.</p>
        ) : (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Seed</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.seed}</td>
                    <td>{run.status}</td>
                    <td>{new Date(run.updated_at).toLocaleDateString("en-US")}</td>
                    <td>
                      <Link className="ghost link-button" href={`/runs/${run.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
