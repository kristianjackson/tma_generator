import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/app/lib/db";
import ExportActions from "@/app/components/ExportActions";
import { getRunDisplayName } from "@/app/lib/run-utils";

type RunRow = {
  id: string;
  seed: string;
  title: string | null;
  status: string;
  filters_json: string | null;
};

type VersionRow = {
  id: string;
  version_type: string;
  content: string;
  created_at: number;
};

const renameRunAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!runId) {
    redirect("/runs");
  }

  const db = requireDb();
  await db
    .prepare("UPDATE story_runs SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(title || null, Date.now(), runId, userId)
    .run();

  revalidatePath(`/runs/${runId}`);
  redirect(`/runs/${runId}`);
};

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

const restoreVersionAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  if (!runId || !versionId) {
    redirect("/runs");
  }

  const db = requireDb();
  const version = await db
    .prepare(
      "SELECT version_type, content FROM story_versions WHERE id = ? AND run_id = ?"
    )
    .bind(versionId, runId)
    .first<{ version_type: string; content: string }>();

  if (!version?.content) {
    redirect(`/runs/${runId}`);
  }

  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      runId,
      version.version_type,
      version.content,
      Date.now()
    )
    .run();

  await db
    .prepare("UPDATE story_runs SET updated_at = ? WHERE id = ?")
    .bind(Date.now(), runId)
    .run();

  revalidatePath(`/runs/${runId}`);
  redirect(`/runs/${runId}`);
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
      "SELECT id, seed, title, status, filters_json FROM story_runs WHERE id = ? AND user_id = ?"
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
      "SELECT id, version_type, content, created_at FROM story_versions WHERE run_id = ? ORDER BY created_at DESC"
    )
    .bind(run.id)
    .all<VersionRow>();

  const filters = run.filters_json ? JSON.parse(run.filters_json) : {};
  const runLabel = getRunDisplayName(run.title, run.seed);

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
          <h2>Run name</h2>
          <form className="form" action={renameRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <input
              name="title"
              className="input"
              defaultValue={run.title ?? ""}
              placeholder="Optional run name"
            />
            <div className="actions">
              <button className="primary" type="submit">
                Save name
              </button>
            </div>
          </form>
          <form className="inline-form" action={deleteRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <button className="ghost" type="submit">
              Delete run
            </button>
          </form>
        </div>
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
            <div key={version.id} className="card">
              <h2>{version.version_type.toUpperCase()}</h2>
              <pre className="code-block">{version.content}</pre>
              <ExportActions
                label="Export version"
                content={version.content}
                filenameBase={`${runLabel}-${version.version_type}`}
              />
              <form className="actions" action={restoreVersionAction}>
                <input type="hidden" name="runId" value={run.id} />
                <input type="hidden" name="versionId" value={version.id} />
                <button className="ghost" type="submit">
                  Restore as latest
                </button>
              </form>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
