import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "../../lib/db";

type SearchParams = {
  run?: string | string[];
};

type RunRow = {
  id: string;
  seed: string;
};

type VersionRow = {
  content: string;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const buildDraft = (seed: string, outline: string) =>
  `Seed: ${seed}\n\nDraft (placeholder):\n${outline}\n\n[Draft content goes here...]`;

const generateDraftAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");

  if (!runId) {
    redirect("/generate/step-1");
  }

  const db = requireDb();
  const run = await db
    .prepare("SELECT id, seed FROM story_runs WHERE id = ?")
    .bind(runId)
    .first<RunRow>();

  if (!run) {
    redirect("/generate/step-1");
  }

  const outlineRow = await db
    .prepare(
      "SELECT content FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "outline")
    .first<VersionRow>();
  const outline = outlineRow?.content ?? "";
  const draft = buildDraft(run.seed, outline);

  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "draft", draft, Date.now())
    .run();

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("drafted", Date.now(), runId)
    .run();

  revalidatePath("/generate/step-3");
  redirect(`/generate/step-3?run=${runId}`);
};

const saveDraftAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!runId) {
    redirect("/generate/step-1");
  }

  if (!content) {
    redirect(`/generate/step-3?run=${runId}`);
  }

  const db = requireDb();
  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "draft", content, Date.now())
    .run();

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("drafted", Date.now(), runId)
    .run();

  revalidatePath("/generate/step-3");
  redirect(`/generate/step-3?run=${runId}`);
};

export default async function GenerateStepThreePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const runId = getFirstValue(resolvedSearchParams?.run);

  if (!runId) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Generator</p>
          <h1>No run selected</h1>
          <p className="subhead">Start with step 1 to create a run.</p>
          <div className="actions">
            <Link className="primary link-button" href="/generate/step-1">
              Go to step 1
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const db = requireDb();
  const run = await db
    .prepare("SELECT id, seed FROM story_runs WHERE id = ?")
    .bind(runId)
    .first<RunRow>();

  if (!run) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Generator</p>
          <h1>Run not found</h1>
          <p className="subhead">This run no longer exists.</p>
          <div className="actions">
            <Link className="primary link-button" href="/generate/step-1">
              Start a new run
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const draftRow = await db
    .prepare(
      "SELECT content FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "draft")
    .first<VersionRow>();
  const draft = draftRow?.content ?? "";

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Generator</p>
        <div className="admin-header">
          <h1>Step 3: Draft</h1>
          <Link className="ghost link-button" href={`/generate/step-2?run=${runId}`}>
            Back to outline
          </Link>
        </div>
        <p className="subhead">Seed: {run.seed}</p>
        <div className="actions">
          <form action={generateDraftAction}>
            <input type="hidden" name="runId" value={runId} />
            <button className="ghost" type="submit">
              Generate draft
            </button>
          </form>
        </div>
        <form className="form" action={saveDraftAction}>
          <input type="hidden" name="runId" value={runId} />
          <label className="form-label" htmlFor="content">
            Draft
          </label>
          <textarea
            id="content"
            name="content"
            className="textarea"
            rows={20}
            defaultValue={draft}
            placeholder="Generate or edit your draft here..."
          />
          <div className="actions">
            <button className="primary" type="submit">
              Save draft
            </button>
            <Link className="ghost link-button" href="/runs">
              View history
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
