import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireDb } from "../../../lib/db";
import { suggestMetadata } from "../../../lib/ai";

type SearchParams = {
  notice?: string | string[];
};

type TranscriptDetailRow = {
  id: string;
  title: string;
  season: number | null;
  episode: number | null;
  summary: string | null;
  source: string | null;
  word_count: number;
  created_at: number;
  fears_json?: string | null;
  cast_json?: string | null;
  themes_json?: string | null;
  tags_json?: string | null;
  locations_json?: string | null;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseJsonList = (value?: string | null) => {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [] as string[];
  }
};

const normalizeList = (value: unknown) => {
  if (!value) {
    return [] as string[];
  }

  const items = Array.isArray(value) ? value : [value];
  const set = new Set(
    items
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 20)
  );

  return Array.from(set);
};

const updateMetadataAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const transcriptId = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const season = Number.parseInt(String(formData.get("season") ?? ""), 10);
  const episode = Number.parseInt(String(formData.get("episode") ?? ""), 10);
  const summary = String(formData.get("summary") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const fears = parseList(String(formData.get("fears") ?? ""));
  const cast = parseList(String(formData.get("cast") ?? ""));
  const motifs = parseList(String(formData.get("motifs") ?? ""));
  const existingTags = String(formData.get("tags_json") ?? "[]");
  const locations = parseList(String(formData.get("locations") ?? ""));

  if (!transcriptId) {
    redirect("/admin/ingestion");
  }

  if (!title) {
    redirect(`/admin/ingestion/${transcriptId}?notice=missing`);
  }

  const db = requireDb();

  await db
    .prepare(
      "UPDATE transcripts SET title = ?, season = ?, episode = ?, summary = ?, source = ? WHERE id = ?"
    )
    .bind(
      title,
      Number.isNaN(season) ? null : season,
      Number.isNaN(episode) ? null : episode,
      summary || null,
      source || null,
      transcriptId
    )
    .run();

  await db
    .prepare(
      `INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(transcript_id) DO UPDATE SET
         fears_json = excluded.fears_json,
         cast_json = excluded.cast_json,
         themes_json = excluded.themes_json,
         tags_json = excluded.tags_json,
         locations_json = excluded.locations_json`
    )
    .bind(
      transcriptId,
      JSON.stringify(fears),
      JSON.stringify(cast),
      JSON.stringify(motifs),
      existingTags,
      JSON.stringify(locations)
    )
    .run();

  revalidatePath("/admin/ingestion");
  revalidatePath(`/admin/ingestion/${transcriptId}`);
  revalidatePath("/generate/step-1");
  redirect(`/admin/ingestion/${transcriptId}?notice=updated`);
};

const suggestMetadataAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const transcriptId = String(formData.get("id") ?? "");

  if (!transcriptId) {
    redirect("/admin/ingestion");
  }

  const db = requireDb();
  const transcript = await db
    .prepare("SELECT id, title, summary, content FROM transcripts WHERE id = ?")
    .bind(transcriptId)
    .first<{ id: string; title: string; summary: string | null; content: string }>();

  if (!transcript) {
    redirect("/admin/ingestion");
  }

  try {
    const suggestion = await suggestMetadata(
      transcript.title,
      transcript.content
    );

    const fears = normalizeList(suggestion.fears);
    const cast = normalizeList(suggestion.cast);
    const motifs = normalizeList(suggestion.motifs);
    const locations = normalizeList(suggestion.locations);
    const summary = String(suggestion.summary ?? "").trim();

    if (summary && !transcript.summary) {
      await db
        .prepare("UPDATE transcripts SET summary = ? WHERE id = ?")
        .bind(summary, transcript.id)
        .run();
    }

      const existing = await db
        .prepare("SELECT tags_json FROM transcript_metadata WHERE transcript_id = ?")
        .bind(transcript.id)
        .first<{ tags_json?: string | null }>();

      await db
        .prepare(
          `INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(transcript_id) DO UPDATE SET
             fears_json = excluded.fears_json,
             cast_json = excluded.cast_json,
             themes_json = excluded.themes_json,
             tags_json = excluded.tags_json,
             locations_json = excluded.locations_json`
        )
        .bind(
          transcript.id,
          JSON.stringify(fears),
          JSON.stringify(cast),
          JSON.stringify(motifs),
          existing?.tags_json ?? JSON.stringify([]),
          JSON.stringify(locations)
        )
        .run();

    revalidatePath("/admin/ingestion");
    revalidatePath(`/admin/ingestion/${transcript.id}`);
    revalidatePath("/generate/step-1");
    redirect(`/admin/ingestion/${transcript.id}?notice=ai-suggested`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ai-failed";
    const notice = message.toLowerCase().includes("binding")
      ? "ai-missing"
      : "ai-failed";
    redirect(`/admin/ingestion/${transcriptId}?notice=${notice}`);
  }
};

export default async function IngestionDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);

  const db = requireDb();
  const transcript = await db
    .prepare(
      `SELECT t.id, t.title, t.season, t.episode, t.summary, t.source, t.word_count, t.created_at,
       m.fears_json, m.cast_json, m.themes_json, m.tags_json, m.locations_json
       FROM transcripts t
       LEFT JOIN transcript_metadata m ON t.id = m.transcript_id
       WHERE t.id = ?`
    )
    .bind(id)
    .first<TranscriptDetailRow>();

  if (!transcript) {
    notFound();
  }

  const fears = parseJsonList(transcript.fears_json);
  const cast = parseJsonList(transcript.cast_json);
  const motifs = parseJsonList(transcript.themes_json);
  const locations = parseJsonList(transcript.locations_json);

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin</p>
        <div className="admin-header">
          <h1>Edit transcript metadata</h1>
          <Link className="ghost link-button" href="/admin/ingestion">
            Back to ingestion
          </Link>
        </div>
        <p className="subhead">
          Update episode info and metadata used by the generator filters.
        </p>
        {notice === "missing" ? (
          <p className="notice">Title is required.</p>
        ) : null}
        {notice === "updated" ? (
          <p className="notice">Transcript metadata saved.</p>
        ) : null}
        {notice === "ai-suggested" ? (
          <p className="notice">AI suggestions applied. Review and edit.</p>
        ) : null}
        {notice === "ai-missing" ? (
          <p className="notice">
            AI binding not configured. Add a Workers AI binding named
            <code>AI</code> to use suggestions.
          </p>
        ) : null}
        {notice === "ai-failed" ? (
          <p className="notice">
            AI suggestion failed. Please try again.
          </p>
        ) : null}

        <div className="card">
          <h2>Transcript details</h2>
          <div className="detail-grid">
            <div className="detail-item">
              <span>ID</span>
              <p className="meta-text">{transcript.id}</p>
            </div>
            <div className="detail-item">
              <span>Word count</span>
              <p className="meta-text">{transcript.word_count}</p>
            </div>
            <div className="detail-item">
              <span>Ingested</span>
              <p className="meta-text">
                {new Date(transcript.created_at).toLocaleDateString("en-US")}
              </p>
            </div>
          </div>
        </div>

        <form className="form" action={updateMetadataAction}>
          <input type="hidden" name="id" value={transcript.id} />
          <input type="hidden" name="tags_json" value={transcript.tags_json ?? "[]"} />

          <label className="form-label" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            className="input"
            defaultValue={transcript.title}
            required
          />

          <div className="form-row">
            <div>
              <label className="form-label" htmlFor="season">
                Season
              </label>
              <input
                id="season"
                name="season"
                className="input"
                defaultValue={transcript.season ?? ""}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="episode">
                Episode
              </label>
              <input
                id="episode"
                name="episode"
                className="input"
                defaultValue={transcript.episode ?? ""}
              />
            </div>
          </div>

          <label className="form-label" htmlFor="summary">
            Summary
          </label>
          <textarea
            id="summary"
            name="summary"
            className="textarea"
            rows={3}
            defaultValue={transcript.summary ?? ""}
          />

          <label className="form-label" htmlFor="source">
            Source note
          </label>
          <input
            id="source"
            name="source"
            className="input"
            defaultValue={transcript.source ?? ""}
          />

          <label className="form-label" htmlFor="fears">
            Fears (comma-separated)
          </label>
          <input
            id="fears"
            name="fears"
            className="input"
            defaultValue={fears.join(", ")}
          />

          <label className="form-label" htmlFor="cast">
            Cast (comma-separated)
          </label>
          <input
            id="cast"
            name="cast"
            className="input"
            defaultValue={cast.join(", ")}
          />

          <label className="form-label" htmlFor="motifs">
            Motifs (comma-separated)
          </label>
          <input
            id="motifs"
            name="motifs"
            className="input"
            defaultValue={motifs.join(", ")}
          />

          <label className="form-label" htmlFor="locations">
            Locations (comma-separated)
          </label>
          <input
            id="locations"
            name="locations"
            className="input"
            defaultValue={locations.join(", ")}
          />

          <div className="actions">
            <button className="primary" type="submit">
              Save metadata
            </button>
            <Link className="ghost link-button" href="/admin/ingestion">
              Cancel
            </Link>
            <button className="ghost" formAction={suggestMetadataAction}>
              Generate suggestions (AI)
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
