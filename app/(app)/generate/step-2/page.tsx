import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/app/lib/db";
import { buildTranscriptContext } from "@/app/lib/retrieval";
import { generateOutline } from "@/app/lib/ai";
import SubmitButton from "@/app/components/SubmitButton";
import ExportActions from "@/app/components/ExportActions";
import DismissibleDetails from "@/app/components/DismissibleDetails";
import { getRunDisplayName } from "@/app/lib/run-utils";

type SearchParams = {
  run?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

type RunRow = {
  id: string;
  seed: string;
  filters_json: string | null;
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

const isNextRedirectError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest =
    "digest" in error ? (error as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
};

const generateOutlineAction = async (formData: FormData) => {
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
    .prepare("SELECT id, seed, filters_json FROM story_runs WHERE id = ?")
    .bind(runId)
    .first<RunRow>();

  if (!run) {
    redirect("/generate/step-1");
  }

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("outline_pending", Date.now(), runId)
    .run();

  const filters = run.filters_json ? JSON.parse(run.filters_json) : {};
  try {
    const context = await buildTranscriptContext(run.seed, filters);
    const outline = await generateOutline({
      seed: run.seed,
      filters,
      context: context.context,
      forbiddenTerms: context.forbiddenTerms,
      notes: notes || undefined
    });

    await db
      .prepare(
        "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(crypto.randomUUID(), runId, "outline", outline, Date.now())
      .run();

    await db
      .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
      .bind("outlined", Date.now(), runId)
      .run();

    revalidatePath("/generate/step-2");
    redirect(`/generate/step-2?run=${runId}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown AI error";
    const normalizedMessage = message.toLowerCase();
    const notice = normalizedMessage.includes("binding")
      ? "ai-missing"
      : normalizedMessage.includes("forbidden canon terms")
        ? "ai-canon-rewrite"
      : normalizedMessage.includes("drifted from seed premise")
        ? "ai-seed-drift"
      : normalizedMessage.includes("token") ||
          normalizedMessage.includes("context") ||
          normalizedMessage.includes("too long") ||
          normalizedMessage.includes("length")
        ? "ai-too-long"
        : "ai-failed";
    console.error("outline_generation_failed", { runId, message });
    await db
      .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
      .bind("seeded", Date.now(), runId)
      .run();
    const params = new URLSearchParams({
      run: runId,
      notice
    });
    if (process.env.NODE_ENV !== "production") {
      params.set("error", message.slice(0, 220));
    }
    redirect(`/generate/step-2?${params.toString()}`);
  }
};

const saveOutlineAction = async (formData: FormData) => {
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
    redirect(`/generate/step-2?run=${runId}`);
  }

  const db = requireDb();
  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "outline", content, Date.now())
    .run();

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("outlined", Date.now(), runId)
    .run();

  revalidatePath("/generate/step-2");
  redirect(`/generate/step-2?run=${runId}`);
};

const restoreOutlineAction = async (formData: FormData) => {
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
    .bind(versionId, runId, "outline")
    .first<VersionRow>();

  if (!version?.content) {
    redirect(`/generate/step-2?run=${runId}`);
  }

  await db
    .prepare(
      "INSERT INTO story_versions (id, run_id, version_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), runId, "outline", version.content, Date.now())
    .run();

  await db
    .prepare("UPDATE story_runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind("outlined", Date.now(), runId)
    .run();

  revalidatePath("/generate/step-2");
  redirect(`/generate/step-2?run=${runId}`);
};

export default async function GenerateStepTwoPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const runId = getFirstValue(resolvedSearchParams?.run);
  const notice = getFirstValue(resolvedSearchParams?.notice);
  const errorMessage = getFirstValue(resolvedSearchParams?.error);

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

  const outlineRow = await db
    .prepare(
      "SELECT content FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(runId, "outline")
    .first<VersionRow>();
  const outline = outlineRow?.content ?? "";
  const hasOutline = Boolean(outline);
  const runLabel = getRunDisplayName(run.title, run.seed);

  const outlineVersions = await db
    .prepare(
      "SELECT id, content, created_at FROM story_versions WHERE run_id = ? AND version_type = ? ORDER BY created_at DESC"
    )
    .bind(runId, "outline")
    .all<VersionHistoryRow>();

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Generator</p>
        <div className="admin-header">
          <h1>Step 2: Outline</h1>
          <Link className="ghost link-button" href="/generate/step-1">
            Back to step 1
          </Link>
        </div>
        <p className="subhead">Seed: {run.seed}</p>
        {notice === "ai-missing" ? (
          <p className="notice">
            AI binding not configured. Add a Workers AI binding named
            <code>AI</code> to generate outlines.
          </p>
        ) : null}
        {notice === "outline-missing" ? (
          <p className="notice">Generate an outline before drafting.</p>
        ) : null}
        {notice === "ai-failed" ? (
          <p className="notice">AI outline generation failed. Try again.</p>
        ) : null}
        {notice === "ai-canon-rewrite" ? (
          <p className="notice">
            AI output reused canon references and was rejected. Try again with
            stricter notes or a more specific seed.
          </p>
        ) : null}
        {notice === "ai-seed-drift" ? (
          <p className="notice">
            AI output drifted away from your seed and was rejected. Add sharper
            notes or tighten the seed premise, then regenerate.
          </p>
        ) : null}
        {notice === "ai-too-long" ? (
          <p className="notice">
            AI outline request exceeded model limits. Try fewer filters or a shorter
            brief.
          </p>
        ) : null}
        {errorMessage ? (
          <p className="notice">
            Error detail: <code>{errorMessage}</code>
          </p>
        ) : null}
        {!hasOutline && !notice ? (
          <p className="notice">
            Click <strong>{hasOutline ? "Regenerate outline" : "Generate outline"}</strong>{" "}
            to create your first outline.
          </p>
        ) : null}
        <div className="card">
          <h2>{hasOutline ? "Regenerate outline" : "Generate outline"}</h2>
          <p className="subhead">
            Add optional notes to steer the outline. Regenerating preserves the
            previous outline as a revision.
          </p>
          <form className="form" action={generateOutlineAction}>
            <input type="hidden" name="runId" value={runId} />
            <label className="form-label" htmlFor="notes">
              Notes for the outline
            </label>
            <textarea
              id="notes"
              name="notes"
              className="textarea"
              rows={3}
              placeholder="Emphasize analog horror and limited narration..."
            />
            <div className="actions">
              <SubmitButton
                className="ghost"
                idleText={hasOutline ? "Regenerate outline" : "Generate outline"}
                pendingText="Generating..."
              />
            </div>
          </form>
        </div>
        <form className="form" action={saveOutlineAction}>
          <input type="hidden" name="runId" value={runId} />
          <label className="form-label" htmlFor="content">
            Outline
          </label>
          <textarea
            id="content"
            name="content"
            className="textarea"
            rows={16}
            defaultValue={outline}
            placeholder="Generate or edit your outline here..."
          />
          <div className="actions">
            <button className="primary" type="submit">
              Save outline
            </button>
            <Link className="ghost link-button" href={`/generate/step-3?run=${runId}`}>
              Continue to draft
            </Link>
          </div>
        </form>
        {outline ? (
          <ExportActions
            label="Export outline"
            content={outline}
            filenameBase={`${runLabel}-outline`}
          />
        ) : null}

        <div className="card">
          <h2>Outline revisions</h2>
          {outlineVersions.results.length === 0 ? (
            <p className="subhead">No outline revisions yet.</p>
          ) : (
            outlineVersions.results.map((version) => (
              <DismissibleDetails
                key={version.id}
                className="revision"
                summary={new Date(version.created_at).toLocaleString("en-US")}
              >
                <pre className="code-block">{version.content}</pre>
                <form className="actions" action={restoreOutlineAction}>
                  <input type="hidden" name="runId" value={runId} />
                  <input type="hidden" name="versionId" value={version.id} />
                  <button className="ghost" type="submit">
                    Restore this outline
                  </button>
                </form>
              </DismissibleDetails>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
