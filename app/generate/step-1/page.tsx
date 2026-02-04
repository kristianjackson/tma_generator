import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "../../lib/db";
import { getTranscriptFilters } from "../../lib/transcripts";

type SearchParams = {
  notice?: string | string[];
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const createRunAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const seed = String(formData.get("seed") ?? "").trim();
  const length = String(formData.get("length") ?? "episode").trim();
  const fears = formData.getAll("fears").map(String);
  const cast = formData.getAll("cast").map(String);
  const motifs = formData.getAll("motifs").map(String);
  const locations = formData.getAll("locations").map(String);
  const warnings = formData.getAll("warnings").map(String);

  if (!seed) {
    redirect("/generate/step-1?notice=missing");
  }

  const runId = crypto.randomUUID();
  const now = Date.now();
  const db = requireDb();

  await db
    .prepare(
      "INSERT INTO story_runs (id, user_id, seed, filters_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      runId,
      userId,
      seed,
      JSON.stringify({ length, fears, cast, motifs, locations, warnings }),
      "seeded",
      now,
      now
    )
    .run();

  revalidatePath("/generate");
  redirect(`/generate/step-2?run=${runId}`);
};

export default async function GenerateStepOnePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);

  let filters;
  let dbReady = true;

  try {
    filters = await getTranscriptFilters();
  } catch {
    dbReady = false;
    filters = {
      fears: [],
      cast: [],
      motifs: [],
      locations: [],
      warnings: []
    };
  }

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Generator</p>
        <div className="admin-header">
          <h1>Step 1: Seed & filters</h1>
          <Link className="ghost link-button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
        <p className="subhead">
          Provide a seed idea and choose reference signals from the transcripts.
        </p>
        {notice === "missing" ? (
          <p className="notice">Please add a seed before continuing.</p>
        ) : null}
        {!dbReady ? (
          <p className="notice">
            D1 is not configured yet. Ingest transcripts before generating.
          </p>
        ) : null}
        <form className="form" action={createRunAction}>
          <label className="form-label" htmlFor="seed">
            Seed idea
          </label>
          <textarea
            id="seed"
            name="seed"
            className="textarea"
            rows={4}
            placeholder="A statement about a subway tunnel that folds into itself..."
            required
          />

          <label className="form-label" htmlFor="length">
            Desired length
          </label>
          <select id="length" name="length" className="select" defaultValue="episode">
            <option value="episode">Episode length (6,000-9,000 words)</option>
            <option value="short">Short (2,000-3,000 words)</option>
            <option value="long">Long (10,000+ words)</option>
          </select>

          <div className="filter-grid">
            <div className="filter-card">
              <h3>Fears</h3>
              {filters.fears.length === 0 ? (
                <p className="subhead">No fears ingested yet.</p>
              ) : (
                filters.fears.map((fear) => (
                  <label key={fear} className="checkbox-row">
                    <input type="checkbox" name="fears" value={fear} />
                    {fear}
                  </label>
                ))
              )}
            </div>
            <div className="filter-card">
              <h3>Cast</h3>
              {filters.cast.length === 0 ? (
                <p className="subhead">No cast ingested yet.</p>
              ) : (
                filters.cast.map((member) => (
                  <label key={member} className="checkbox-row">
                    <input type="checkbox" name="cast" value={member} />
                    {member}
                  </label>
                ))
              )}
            </div>
            <div className="filter-card">
              <h3>Motifs</h3>
              {filters.motifs.length === 0 ? (
                <p className="subhead">No motifs ingested yet.</p>
              ) : (
                filters.motifs.map((motif) => (
                  <label key={motif} className="checkbox-row">
                    <input type="checkbox" name="motifs" value={motif} />
                    {motif}
                  </label>
                ))
              )}
            </div>
            <div className="filter-card">
              <h3>Locations</h3>
              {filters.locations.length === 0 ? (
                <p className="subhead">No locations ingested yet.</p>
              ) : (
                filters.locations.map((location) => (
                  <label key={location} className="checkbox-row">
                    <input type="checkbox" name="locations" value={location} />
                    {location}
                  </label>
                ))
              )}
            </div>
            <div className="filter-card">
              <h3>Content warnings</h3>
              {filters.warnings.length === 0 ? (
                <p className="subhead">No warnings ingested yet.</p>
              ) : (
                filters.warnings.map((warning) => (
                  <label key={warning} className="checkbox-row">
                    <input type="checkbox" name="warnings" value={warning} />
                    {warning}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={!dbReady}>
              Continue to outline
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
