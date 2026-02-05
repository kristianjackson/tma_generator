import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/app/lib/db";
import ExportActions from "@/app/components/ExportActions";
import { getRunDisplayName } from "@/app/lib/run-utils";

type SearchParams = {
  run?: string | string[];
  notice?: string | string[];
};

type RunRow = {
  id: string;
  seed: string;
  title?: string | null;
  filters_json?: string | null;
};

type VersionRow = {
  content: string;
  created_at: number;
};

type DiffLine = {
  text: string;
  status: "same" | "added" | "removed";
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const normalizeLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

const buildLineDiff = (base: string, compare: string, mode: "base" | "compare") => {
  const baseLines = normalizeLines(base);
  const compareLines = normalizeLines(compare);
  const baseSet = new Set(baseLines);
  const compareSet = new Set(compareLines);

  const target = mode === "base" ? baseLines : compareLines;

  return target.map((line) => {
    if (mode === "base") {
      return {
        text: line,
        status: compareSet.has(line) ? "same" : "removed"
      } as DiffLine;
    }

    return {
      text: line,
      status: baseSet.has(line) ? "same" : "added"
    } as DiffLine;
  });
};

const saveFinalAction = async (formData: FormData) => {
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
    redirect(`/generate/review?run=${runId}&notice=missing`);
  }

  const db = requireDb();
  const run = await db
    .prepare("SELECT id FROM story_runs WHERE id = ? AND user_id = ?")
    .bind(runId, userId)
    .first<{ id: string }>();

  if (!run) {
    redirect("/generate/step-1");
  }

  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "final", content, Date.now())
    .run();

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("final", Date.now(), runId)
    .run();

  revalidatePath(`/generate/review?run=${runId}`);
  redirect(`/generate/review?run=${runId}&notice=final`);
};

export default async function GenerateReviewPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const runId = getFirstValue(resolvedSearchParams?.run);
  const notice = getFirstValue(resolvedSearchParams?.notice);

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
    .prepare("SELECT id, seed, title, filters_json FROM story_runs WHERE id = ?")
    .bind(runId)
    .first<RunRow>();

  if (!run) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Generator</p>
          <h1>Run not found</h1>
          <div className="actions">
            <Link className="primary link-button" href="/generate/step-1">
              Start a new run
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const outlineRow = await db
    .prepare(
      "SELECT content, created_at FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "outline")
    .first<VersionRow>();
  const draftRow = await db
    .prepare(
      "SELECT content, created_at FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "draft")
    .first<VersionRow>();
  const finalRow = await db
    .prepare(
      "SELECT content, created_at FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "final")
    .first<VersionRow>();

  const outline = outlineRow?.content ?? "";
  const draft = draftRow?.content ?? "";
  const runLabel = getRunDisplayName(run.title, run.seed);
  const outlineDiff = buildLineDiff(outline, draft, "base");
  const draftDiff = buildLineDiff(outline, draft, "compare");

  if (!outline || !draft) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Generator</p>
          <h1>Review unavailable</h1>
          <p className="subhead">
            Generate both an outline and a draft before reviewing.
          </p>
          <div className="actions">
            <Link className="ghost link-button" href={`/generate/step-2?run=${runId}`}>
              Go to outline
            </Link>
            <Link className="primary link-button" href={`/generate/step-3?run=${runId}`}>
              Go to draft
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const filters = run.filters_json ? JSON.parse(run.filters_json) : {};
  const brief = typeof filters.brief === "string" ? filters.brief : "";

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Generator</p>
        <div className="admin-header">
          <h1>Review & edit</h1>
          <Link className="ghost link-button" href={`/generate/step-3?run=${runId}`}>
            Back to draft
          </Link>
        </div>
        <p className="subhead">Seed: {run.seed}</p>
        {brief ? <p className="hint">Run brief: {brief}</p> : null}
        {notice === "missing" ? (
          <p className="notice">Add final text before saving.</p>
        ) : null}
        {notice === "final" ? (
          <p className="notice">Final version saved.</p>
        ) : null}
        {finalRow ? (
          <div className="card">
            <h2>Current final</h2>
            <p className="subhead">
              Saved {new Date(finalRow.created_at).toLocaleString("en-US")}
            </p>
            <pre className="code-block">{finalRow.content}</pre>
            <ExportActions
              label="Export final"
              content={finalRow.content}
              filenameBase={`${runLabel}-final`}
            />
          </div>
        ) : null}
        <div className="card">
          <h2>Outline vs draft diff</h2>
          <p className="subhead">
            Added lines appear in green on the draft side. Lines missing from the draft
            appear in red on the outline side.
          </p>
          <div className="diff-grid">
            <div className="diff-panel">
              <h3>Outline</h3>
              <div className="diff-list">
                {outlineDiff.map((line, index) => (
                  <div key={`${line.text}-${index}`} className={`diff-line ${line.status}`}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="diff-panel">
              <h3>Draft</h3>
              <div className="diff-list">
                {draftDiff.map((line, index) => (
                  <div key={`${line.text}-${index}`} className={`diff-line ${line.status}`}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <h2>Finalize</h2>
          <p className="subhead">
            Edit the draft below and save it as the final version.
          </p>
          <form className="form" action={saveFinalAction}>
            <input type="hidden" name="runId" value={runId} />
            <label className="form-label" htmlFor="content">
              Final draft
            </label>
            <textarea
              id="content"
              name="content"
              className="textarea"
              rows={20}
              defaultValue={draft}
            />
            <div className="actions">
              <button className="primary" type="submit">
                Save final
              </button>
              <Link className="ghost link-button" href={`/runs/${runId}`}>
                View run history
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
