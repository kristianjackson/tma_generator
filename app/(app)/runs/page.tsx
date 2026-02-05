import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/app/lib/db";
import { getRunDisplayName } from "@/app/lib/run-utils";

type RunRow = {
  id: string;
  title: string | null;
  seed: string;
  status: string;
  created_at: number;
  updated_at: number;
};

type SearchParams = {
  notice?: string | string[];
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const deleteRunAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  if (!runId) {
    redirect("/runs");
  }

  const db = requireDb();
  await db
    .prepare("DELETE FROM story_runs WHERE id = ? AND user_id = ?")
    .bind(runId, userId)
    .run();

  revalidatePath("/runs");
  redirect("/runs?notice=deleted");
};

export default async function RunsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);
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
      "SELECT id, title, seed, status, created_at, updated_at FROM story_runs WHERE user_id = ? ORDER BY updated_at DESC"
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
        {notice === "deleted" ? (
          <p className="notice">Run deleted.</p>
        ) : null}
        {runs.length === 0 ? (
          <p className="subhead">No runs saved yet.</p>
        ) : (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{getRunDisplayName(run.title, run.seed)}</td>
                    <td>{run.status}</td>
                    <td>{new Date(run.updated_at).toLocaleDateString("en-US")}</td>
                    <td>
                      <Link className="ghost link-button" href={`/runs/${run.id}`}>
                        View
                      </Link>
                      <form className="inline-form" action={deleteRunAction}>
                        <input type="hidden" name="runId" value={run.id} />
                        <button className="ghost" type="submit">
                          Delete
                        </button>
                      </form>
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
