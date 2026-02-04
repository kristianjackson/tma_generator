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
  filters_json: string | null;
};

type VersionRow = {
  content: string;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const buildOutline = (seed: string, filters: Record<string, unknown>) => {
  const parts = [
    "1. Opening statement and framing",
    "2. Early anomaly / hook",
    "3. Escalation and key encounter",
    "4. Revelation of the fear manifestation",
    "5. Aftermath, archival notes, and closing"
  ];

  const filterNotes = Object.entries(filters)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${(value as string[]).join(", ")}`)
    .join("\n");

  return `Seed: ${seed}\n\n${filterNotes || "Filters: none"}\n\nOutline:\n${parts.join(
    "\n"
  )}`;
};

const generateOutlineAction = async (formData: FormData) => {
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
    .prepare("SELECT id, seed, filters_json FROM story_runs WHERE id = ?")
    .bind(runId)
    .first<RunRow>();

  if (!run) {
    redirect("/generate/step-1");
  }

  const filters = run.filters_json ? JSON.parse(run.filters_json) : {};
  const outline = buildOutline(run.seed, filters);

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

export default async function GenerateStepTwoPage({
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
    .prepare("SELECT id, seed, filters_json FROM story_runs WHERE id = ?")
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
        <div className="actions">
          <form action={generateOutlineAction}>
            <input type="hidden" name="runId" value={runId} />
            <button className="ghost" type="submit">
              Generate outline
            </button>
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
      </section>
    </main>
  );
}
