import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/app/lib/db";
import { getTranscriptFilters } from "@/app/lib/transcripts";
import {
  formatDailyLimit,
  getRunDailyLimit,
  getWindowStart,
  isLimitReached
} from "@/app/lib/limits";

type SearchParams = {
  notice?: string | string[];
  limit?: string | string[];
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
  const title = String(formData.get("title") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const length = String(formData.get("length") ?? "episode").trim();
  const tone = String(formData.get("tone") ?? "classic").trim();
  const includeCast = String(formData.get("include_cast") ?? "") === "yes";
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

  const { limit } = await getRunDailyLimit(userId);
  const windowStart = getWindowStart(now);
  const usageRow = await db
    .prepare(
      "SELECT COUNT(*) as total FROM story_runs WHERE user_id = ? AND created_at >= ?"
    )
    .bind(userId, windowStart)
    .first<{ total: number }>();
  const usageCount = usageRow?.total ?? 0;

  if (isLimitReached(usageCount, limit)) {
    redirect(`/generate/step-1?notice=limit&limit=${limit}`);
  }

  await db
    .prepare(
      "INSERT INTO story_runs (id, user_id, seed, title, filters_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      runId,
      userId,
      seed,
      title || null,
      JSON.stringify({
        brief: brief || null,
        length,
        tone,
        includeCast,
        fears,
        cast,
        motifs,
        locations,
        warnings
      }),
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
  const limitParam = getFirstValue(resolvedSearchParams?.limit);
  const limit = Number.parseInt(limitParam ?? "", 10);
  const fallbackLimitInfo = await getRunDailyLimit(undefined);
  const dailyLimit = Number.isNaN(limit) ? fallbackLimitInfo.limit : limit;

  let filters;
  let dbReady = true;
  let usageCount = 0;
  let limitLabel: string | null = null;

  try {
    filters = await getTranscriptFilters();
    const { userId } = await auth();
    if (userId) {
      const db = requireDb();
      const windowStart = getWindowStart();
      const usageRow = await db
        .prepare(
          "SELECT COUNT(*) as total FROM story_runs WHERE user_id = ? AND created_at >= ?"
        )
        .bind(userId, windowStart)
        .first<{ total: number }>();
      usageCount = usageRow?.total ?? 0;
      const limitInfo = await getRunDailyLimit(userId);
      limitLabel = formatDailyLimit(limitInfo.limit);
    }
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
        {notice === "limit" ? (
          <p className="notice">
            You have reached the daily run limit ({formatDailyLimit(dailyLimit)}). Try
            again tomorrow.
          </p>
        ) : null}
        {!dbReady ? (
          <p className="notice">
            D1 is not configured yet. Ingest transcripts before generating.
          </p>
        ) : null}
        {dbReady ? (
          <p className="hint">
            Runs used in last 24 hours: {usageCount} /{" "}
            {limitLabel ?? formatDailyLimit(dailyLimit)}
          </p>
        ) : null}
        <form className="form" action={createRunAction}>
          <label className="form-label" htmlFor="title">
            Run name (optional)
          </label>
          <input id="title" name="title" className="input" />

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

          <label className="form-label" htmlFor="brief">
            Run brief (optional)
          </label>
          <textarea
            id="brief"
            name="brief"
            className="textarea"
            rows={3}
            placeholder="Key beats, tone specifics, or must-include elements..."
          />

          <label className="form-label" htmlFor="length">
            Desired length
          </label>
          <select id="length" name="length" className="select" defaultValue="episode">
            <option value="episode">Episode length (6,000-9,000 words)</option>
            <option value="short">Short (2,000-3,000 words)</option>
            <option value="long">Long (10,000+ words)</option>
          </select>

          <label className="form-label" htmlFor="tone">
            Tone preset
          </label>
          <select id="tone" name="tone" className="select" defaultValue="classic">
            <option value="classic">Classic TMA (archival, understated)</option>
            <option value="modern">Modern horror (sharper, cinematic)</option>
            <option value="experimental">Experimental (unnerving, fragmented)</option>
          </select>

          <label className="checkbox-row">
            <input type="checkbox" name="include_cast" value="yes" defaultChecked />
            Include established Magnus Institute cast
          </label>

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
