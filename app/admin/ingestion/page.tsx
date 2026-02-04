import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "../../lib/db";

type SearchParams = {
  notice?: string | string[];
};

type TranscriptRow = {
  id: string;
  title: string;
  season: number | null;
  episode: number | null;
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

const formatJsonList = (value?: string | null) => {
  const items = parseJsonList(value);
  return items.length > 0 ? items.join(", ") : "—";
};

const chunkTranscript = (content: string, chunkSize = 1200) => {
  const chunks: string[] = [];
  let buffer = "";

  content.split(/\n\n+/).forEach((paragraph) => {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;

    if (next.length >= chunkSize) {
      if (buffer) {
        chunks.push(buffer.trim());
      }
      buffer = paragraph;
    } else {
      buffer = next;
    }
  });

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
};

const ingestTranscriptAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const title = String(formData.get("title") ?? "").trim();
  const season = Number.parseInt(String(formData.get("season") ?? ""), 10);
  const episode = Number.parseInt(String(formData.get("episode") ?? ""), 10);
  const summary = String(formData.get("summary") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const fears = parseList(String(formData.get("fears") ?? ""));
  const cast = parseList(String(formData.get("cast") ?? ""));
  const themes = parseList(String(formData.get("themes") ?? ""));
  const tags = parseList(String(formData.get("tags") ?? ""));
  const locations = parseList(String(formData.get("locations") ?? ""));
  const contentField = String(formData.get("content") ?? "").trim();
  const file = formData.get("file");
  const fileContent =
    file && typeof file === "object" && "text" in file
      ? await (file as File).text()
      : "";
  const content = contentField || fileContent.trim();

  if (!title || !content) {
    redirect("/admin/ingestion?notice=missing");
  }

  const transcriptId = crypto.randomUUID();
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const createdAt = Date.now();
  const db = requireDb();

  await db
    .prepare(
      "INSERT INTO transcripts (id, title, season, episode, summary, content, source, word_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      transcriptId,
      title,
      Number.isNaN(season) ? null : season,
      Number.isNaN(episode) ? null : episode,
      summary || null,
      content,
      source || null,
      wordCount,
      createdAt
    )
    .run();

  await db
    .prepare(
      "INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      transcriptId,
      JSON.stringify(fears),
      JSON.stringify(cast),
      JSON.stringify(themes),
      JSON.stringify(tags),
      JSON.stringify(locations)
    )
    .run();

  const chunks = chunkTranscript(content);

  await Promise.all(
    chunks.map((chunk, index) =>
      db
        .prepare(
          "INSERT INTO transcript_chunks (id, transcript_id, chunk_index, content, keywords_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          transcriptId,
          index,
          chunk,
          JSON.stringify([]),
          createdAt
        )
        .run()
    )
  );

  revalidatePath("/admin/ingestion");
  redirect("/admin/ingestion?notice=ingested");
};

export default async function IngestionPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = getFirstValue(resolvedSearchParams?.notice);

  let transcripts: TranscriptRow[] = [];
  let dbReady = true;

  try {
    const db = requireDb();
    const result = await db
      .prepare(
        "SELECT t.id, t.title, t.season, t.episode, t.word_count, t.created_at, m.fears_json, m.cast_json, m.themes_json, m.tags_json, m.locations_json FROM transcripts t LEFT JOIN transcript_metadata m ON t.id = m.transcript_id ORDER BY t.created_at DESC"
      )
      .bind()
      .all<TranscriptRow>();
    transcripts = result.results;
  } catch {
    dbReady = false;
  }

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin</p>
        <div className="admin-header">
          <h1>Transcript ingestion</h1>
          <Link className="ghost link-button" href="/admin">
            Back to admin
          </Link>
        </div>
        <p className="subhead">
          Load transcripts, tag metadata (fears, cast, themes), and prepare
          chunks for retrieval.
        </p>
        <p className="hint">
          For batch PDF ingestion, run the local script in
          <code>scripts/ingest-pdfs.mjs</code> to populate D1, then return here to
          review metadata.
        </p>
        {notice === "missing" ? (
          <p className="notice">Title and content are required.</p>
        ) : null}
        {notice === "ingested" ? (
          <p className="notice">Transcript ingested successfully.</p>
        ) : null}
        {!dbReady ? (
          <p className="notice">
            D1 is not configured yet. Add the `DB` binding and run migrations to
            use ingestion.
          </p>
        ) : null}
        <form className="form" action={ingestTranscriptAction}>
          <label className="form-label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" className="input" required />

          <div className="form-row">
            <div>
              <label className="form-label" htmlFor="season">
                Season
              </label>
              <input id="season" name="season" className="input" />
            </div>
            <div>
              <label className="form-label" htmlFor="episode">
                Episode
              </label>
              <input id="episode" name="episode" className="input" />
            </div>
          </div>

          <label className="form-label" htmlFor="summary">
            Summary
          </label>
          <textarea id="summary" name="summary" className="textarea" rows={3} />

          <label className="form-label" htmlFor="source">
            Source link or note
          </label>
          <input id="source" name="source" className="input" />

          <label className="form-label" htmlFor="fears">
            Fears (comma-separated)
          </label>
          <input id="fears" name="fears" className="input" />

          <label className="form-label" htmlFor="cast">
            Cast (comma-separated)
          </label>
          <input id="cast" name="cast" className="input" />

          <label className="form-label" htmlFor="themes">
            Themes (comma-separated)
          </label>
          <input id="themes" name="themes" className="input" />

          <label className="form-label" htmlFor="tags">
            Tags (comma-separated)
          </label>
          <input id="tags" name="tags" className="input" />

          <label className="form-label" htmlFor="locations">
            Locations (comma-separated)
          </label>
          <input id="locations" name="locations" className="input" />

          <label className="form-label" htmlFor="content">
            Transcript text
          </label>
          <textarea id="content" name="content" className="textarea" rows={12} />

          <label className="form-label" htmlFor="file">
            Or upload a .txt file
          </label>
          <input id="file" name="file" className="input" type="file" />

          <div className="actions">
            <button className="primary" type="submit" disabled={!dbReady}>
              Ingest transcript
            </button>
          </div>
        </form>

        <div className="card table-card">
          <h2>Ingested transcripts</h2>
          {transcripts.length === 0 ? (
            <p className="subhead">No transcripts ingested yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Actions</th>
                  <th>Season</th>
                  <th>Episode</th>
                  <th>Word count</th>
                  <th>Metadata</th>
                  <th>Ingested</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.map((transcript) => (
                  <tr key={transcript.id}>
                    <td>{transcript.title}</td>
                    <td>
                      <Link
                        className="ghost link-button"
                        href={`/admin/ingestion/${transcript.id}`}
                      >
                        Edit
                      </Link>
                    </td>
                    <td>{transcript.season ?? "—"}</td>
                    <td>{transcript.episode ?? "—"}</td>
                    <td>{transcript.word_count}</td>
                    <td>
                      <div className="meta-stack">
                        <span>
                          <strong>Fears:</strong>{" "}
                          {formatJsonList(transcript.fears_json)}
                        </span>
                        <span>
                          <strong>Cast:</strong>{" "}
                          {formatJsonList(transcript.cast_json)}
                        </span>
                        <span>
                          <strong>Themes:</strong>{" "}
                          {formatJsonList(transcript.themes_json)}
                        </span>
                        <span>
                          <strong>Tags:</strong>{" "}
                          {formatJsonList(transcript.tags_json)}
                        </span>
                        <span>
                          <strong>Locations:</strong>{" "}
                          {formatJsonList(transcript.locations_json)}
                        </span>
                      </div>
                    </td>
                    <td>{new Date(transcript.created_at).toLocaleDateString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
