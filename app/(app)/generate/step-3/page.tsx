import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/app/lib/db";
import { buildTranscriptContext } from "@/app/lib/retrieval";
import { generateDraft } from "@/app/lib/ai";
import AutoSubmitForm from "@/app/components/AutoSubmitForm";
import SubmitButton from "@/app/components/SubmitButton";
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
};

type VersionRow = {
  id?: string;
  content: string;
};
type VersionHistoryRow = {
  id: string;
  content: string;
  created_at: number;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const generateDraftAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

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

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("draft_pending", Date.now(), runId)
    .run();

  const outlineRow = await db
    .prepare(
      "SELECT content FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "outline")
    .first<VersionRow>();
  const outline = outlineRow?.content ?? "";
  if (!outline) {
    redirect(`/generate/step-2?run=${runId}&notice=outline-missing`);
  }
  try {
    const filtersRow = await db
      .prepare("SELECT filters_json FROM story_runs WHERE id = ?")
      .bind(runId)
      .first<{ filters_json: string | null }>();
    const filters = filtersRow?.filters_json
      ? JSON.parse(filtersRow.filters_json)
      : {};

    const context = await buildTranscriptContext(run.seed, filters);
    const draft = await generateDraft({
      seed: run.seed,
      outline,
      filters,
      context: context.context,
      notes: notes || undefined
    });

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
  } catch (error) {
    const notice =
      error instanceof Error && error.message.toLowerCase().includes("binding")
        ? "ai-missing"
        : "ai-failed";
    redirect(`/generate/step-3?run=${runId}&notice=${notice}`);
  }
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

const restoreDraftAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const runId = String(formData.get("runId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  if (!runId || !versionId) {
    redirect("/generate/step-1");
  }

  const db = requireDb();
  const version = await db
    .prepare(
      "SELECT content FROM story_versions WHERE id = ? AND run_id = ? AND version_type = ?"
    )
    .bind(versionId, runId, "draft")
    .first<VersionRow>();

  if (!version?.content) {
    redirect(`/generate/step-3?run=${runId}`);
  }

  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "draft", version.content, Date.now())
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
    .prepare("SELECT id, seed, title FROM story_runs WHERE id = ?")
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
  const shouldAutoGenerate = !draft && !notice;
  const hasDraft = Boolean(draft);
  const runLabel = getRunDisplayName(run.title, run.seed);

  const draftVersions = await db
    .prepare(
      "SELECT id, content, created_at FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC"
    )
    .bind(runId, "draft")
    .all<VersionHistoryRow>();

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
        {notice === "ai-missing" ? (
          <p className="notice">
            AI binding not configured. Add a Workers AI binding named
            <code>AI</code> to generate drafts.
          </p>
        ) : null}
        {notice === "ai-failed" ? (
          <p className="notice">AI draft generation failed. Try again.</p>
        ) : null}
        {shouldAutoGenerate ? (
          <div className="notice notice-loading">
            <span className="spinner" aria-hidden="true" />
            Generating draft now. This can take a minute.
          </div>
        ) : null}
        <div className="card">
          <h2>{hasDraft ? "Regenerate draft" : "Generate draft"}</h2>
          <p className="subhead">
            Add optional notes to steer the draft. Regenerating preserves the
            previous draft as a revision.
          </p>
          <form className="form" action={generateDraftAction}>
            <input type="hidden" name="runId" value={runId} />
            <label className="form-label" htmlFor="notes">
              Notes for the draft
            </label>
            <textarea
              id="notes"
              name="notes"
              className="textarea"
              rows={3}
              placeholder="Lean into the statement voice and add a cold open..."
            />
            <div className="actions">
              <SubmitButton
                className="ghost"
                idleText={hasDraft ? "Regenerate draft" : "Generate draft"}
                pendingText="Generating..."
              />
            </div>
          </form>
          <AutoSubmitForm action={generateDraftAction} enabled={shouldAutoGenerate}>
            <input type="hidden" name="runId" value={runId} />
          </AutoSubmitForm>
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
            <Link className="ghost link-button" href={`/generate/review?run=${runId}`}>
              Review & edit
            </Link>
            <Link className="ghost link-button" href="/runs">
              View history
            </Link>
          </div>
        </form>
        {draft ? (
          <ExportActions
            label="Export draft"
            content={draft}
            filenameBase={`${runLabel}-draft`}
          />
        ) : null}

        <div className="card">
          <h2>Draft revisions</h2>
          {draftVersions.results.length === 0 ? (
            <p className="subhead">No draft revisions yet.</p>
          ) : (
            draftVersions.results.map((version) => (
              <details key={version.id} className="revision">
                <summary>
                  {new Date(version.created_at).toLocaleString("en-US")}
                </summary>
                <pre className="code-block">{version.content}</pre>
                <form className="actions" action={restoreDraftAction}>
                  <input type="hidden" name="runId" value={runId} />
                  <input type="hidden" name="versionId" value={version.id} />
                  <button className="ghost" type="submit">
                    Restore this draft
                  </button>
                </form>
              </details>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
