import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/app/lib/db";
import { suggestMetadata } from "@/app/lib/ai";
import SelectAllCheckbox from "@/app/components/SelectAllCheckbox";

type SearchParams = {
  notice?: string | string[];
  q?: string | string[];
  page?: string | string[];
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
  locations_json?: string | null;
  warnings_json?: string | null;
};

type TranscriptMetaRow = {
  fears_json?: string | null;
  cast_json?: string | null;
  themes_json?: string | null;
  tags_json?: string | null;
  locations_json?: string | null;
  warnings_json?: string | null;
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

const mergeList = (
  existing: string[],
  updates: string[],
  mode: "append" | "replace",
  allowEmpty: boolean
) => {
  if (updates.length === 0 && !allowEmpty) {
    return existing;
  }

  if (mode === "replace") {
    return updates;
  }

  const set = new Set([...existing, ...updates]);
  return Array.from(set);
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

const bulkUpdateMetadataAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const selectedIds = formData.getAll("selectedIds").map(String).filter(Boolean);
  const fears = parseList(String(formData.get("bulk_fears") ?? ""));
  const cast = parseList(String(formData.get("bulk_cast") ?? ""));
  const motifs = parseList(String(formData.get("bulk_motifs") ?? ""));
  const locations = parseList(String(formData.get("bulk_locations") ?? ""));
  const warnings = parseList(String(formData.get("bulk_warnings") ?? ""));
  const mode =
    String(formData.get("bulk_mode") ?? "append") === "replace"
      ? "replace"
      : "append";
  const allowEmpty = String(formData.get("bulk_allow_empty") ?? "") === "yes";

  if (selectedIds.length === 0) {
    redirect("/admin/ingestion?notice=bulk-missing");
  }

  const db = requireDb();

  for (const id of selectedIds) {
    const existing = await db
      .prepare(
        "SELECT fears_json, cast_json, themes_json, tags_json, locations_json, warnings_json FROM transcript_metadata WHERE transcript_id = ?"
      )
      .bind(id)
      .first<TranscriptMetaRow>();

    const nextFears = mergeList(
      parseJsonList(existing?.fears_json),
      fears,
      mode,
      allowEmpty
    );
    const nextCast = mergeList(
      parseJsonList(existing?.cast_json),
      cast,
      mode,
      allowEmpty
    );
    const nextMotifs = mergeList(
      parseJsonList(existing?.themes_json),
      motifs,
      mode,
      allowEmpty
    );
    const nextLocations = mergeList(
      parseJsonList(existing?.locations_json),
      locations,
      mode,
      allowEmpty
    );
    const nextWarnings = mergeList(
      parseJsonList(existing?.warnings_json),
      warnings,
      mode,
      allowEmpty
    );

    await db
      .prepare(
        `INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json, warnings_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(transcript_id) DO UPDATE SET
           fears_json = excluded.fears_json,
           cast_json = excluded.cast_json,
           themes_json = excluded.themes_json,
           tags_json = excluded.tags_json,
           locations_json = excluded.locations_json,
           warnings_json = excluded.warnings_json`
      )
      .bind(
        id,
        JSON.stringify(nextFears),
        JSON.stringify(nextCast),
        JSON.stringify(nextMotifs),
        existing?.tags_json ?? JSON.stringify([]),
        JSON.stringify(nextLocations),
        JSON.stringify(nextWarnings)
      )
      .run();
  }

  revalidatePath("/admin/ingestion");
  revalidatePath("/generate/step-1");
  redirect("/admin/ingestion?notice=bulk-updated");
};

const batchAiSuggestAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const selectedIds = formData.getAll("selectedIds").map(String).filter(Boolean);
  const limit = Number.parseInt(String(formData.get("ai_limit") ?? "5"), 10);
  const effectiveLimit = Number.isNaN(limit) ? 5 : Math.min(limit, 10);

  if (selectedIds.length === 0) {
    redirect("/admin/ingestion?notice=bulk-missing");
  }

  const db = requireDb();
  const toProcess = selectedIds.slice(0, effectiveLimit);

  try {
    for (const id of toProcess) {
      const transcript = await db
        .prepare("SELECT id, title, summary, content FROM transcripts WHERE id = ?")
        .bind(id)
        .first<{ id: string; title: string; summary: string | null; content: string }>();

      if (!transcript) {
        continue;
      }

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
        .prepare(
          "SELECT tags_json, warnings_json FROM transcript_metadata WHERE transcript_id = ?"
        )
        .bind(transcript.id)
        .first<{ tags_json?: string | null; warnings_json?: string | null }>();

      await db
        .prepare(
          `INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json, warnings_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(transcript_id) DO UPDATE SET
             fears_json = excluded.fears_json,
             cast_json = excluded.cast_json,
             themes_json = excluded.themes_json,
             tags_json = excluded.tags_json,
             locations_json = excluded.locations_json,
             warnings_json = excluded.warnings_json`
        )
        .bind(
          transcript.id,
          JSON.stringify(fears),
          JSON.stringify(cast),
          JSON.stringify(motifs),
          existing?.tags_json ?? JSON.stringify([]),
          JSON.stringify(locations),
          existing?.warnings_json ?? JSON.stringify([])
        )
        .run();
    }

    revalidatePath("/admin/ingestion");
    revalidatePath("/generate/step-1");
    redirect("/admin/ingestion?notice=ai-batch");
  } catch (error) {
    const notice =
      error instanceof Error && error.message.toLowerCase().includes("binding")
        ? "ai-missing"
        : "ai-failed";
    redirect(`/admin/ingestion?notice=${notice}`);
  }
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
  const motifs = parseList(String(formData.get("motifs") ?? ""));
  const locations = parseList(String(formData.get("locations") ?? ""));
  const warnings = parseList(String(formData.get("warnings") ?? ""));
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
      "INSERT INTO transcript_metadata (transcript_id, fears_json, cast_json, themes_json, tags_json, locations_json, warnings_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      transcriptId,
      JSON.stringify(fears),
      JSON.stringify(cast),
      JSON.stringify(motifs),
      JSON.stringify([]),
      JSON.stringify(locations),
      JSON.stringify(warnings)
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
  const query = getFirstValue(resolvedSearchParams?.q)?.trim();
  const pageParam = getFirstValue(resolvedSearchParams?.page);
  const pageNumber = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const pageSize = 10;
  const offset = (pageNumber - 1) * pageSize;

  let transcripts: TranscriptRow[] = [];
  let dbReady = true;
  let totalCount = 0;

  try {
    const db = requireDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query) {
      const like = `%${query}%`;
      conditions.push("(t.title LIKE ? OR t.source LIKE ?)");
      params.push(like, like);

      const numeric = Number.parseInt(query, 10);
      if (!Number.isNaN(numeric)) {
        conditions.push("(t.episode = ? OR t.season = ?)");
        params.push(numeric, numeric);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";
    const result = await db
      .prepare(
        `SELECT t.id, t.title, t.season, t.episode, t.word_count, t.created_at, m.fears_json, m.cast_json, m.themes_json, m.locations_json, m.warnings_json
         FROM transcripts t
         LEFT JOIN transcript_metadata m ON t.id = m.transcript_id
         ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, pageSize, offset)
      .all<TranscriptRow>();
    transcripts = result.results;

    const countResult = await db
      .prepare(
        `SELECT COUNT(*) as total
         FROM transcripts t
         ${whereClause}`
      )
      .bind(...params)
      .first<{ total: number }>();
    totalCount = countResult?.total ?? 0;
  } catch {
    dbReady = false;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const buildPageLink = (page: number) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    const queryString = params.toString();
    return queryString ? `/admin/ingestion?${queryString}` : "/admin/ingestion";
  };

  return (
    <main className="page">
      <section className="hero hero-wide hero-ingestion">
        <p className="eyebrow">Admin</p>
        <div className="admin-header">
          <h1>Transcript ingestion</h1>
          <Link className="ghost link-button" href="/admin">
            Back to admin
          </Link>
        </div>
        <p className="subhead">
          Load transcripts, tag metadata (fears, cast, motifs, warnings), and
          prepare chunks for retrieval.
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
        {notice === "bulk-updated" ? (
          <p className="notice">Bulk metadata update applied.</p>
        ) : null}
        {notice === "bulk-missing" ? (
          <p className="notice">Select at least one transcript first.</p>
        ) : null}
        {notice === "ai-batch" ? (
          <p className="notice">
            AI suggestions applied to selected transcripts. Review and edit.
          </p>
        ) : null}
        {notice === "ai-missing" ? (
          <p className="notice">
            AI binding not configured. Add a Workers AI binding named
            <code>AI</code> to use suggestions.
          </p>
        ) : null}
        {notice === "ai-failed" ? (
          <p className="notice">AI batch tagging failed. Try again.</p>
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

          <label className="form-label" htmlFor="motifs">
            Motifs (comma-separated)
          </label>
          <input id="motifs" name="motifs" className="input" />

          <label className="form-label" htmlFor="locations">
            Locations (comma-separated)
          </label>
          <input id="locations" name="locations" className="input" />

          <label className="form-label" htmlFor="warnings">
            Content warnings (comma-separated)
          </label>
          <input id="warnings" name="warnings" className="input" />

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

        <div className="card">
          <h2>Search transcripts</h2>
          <form className="search" method="get">
            <input
              className="input"
              name="q"
              placeholder="Search by title, source, episode..."
              defaultValue={query ?? ""}
            />
            <button className="ghost link-button" type="submit">
              Search
            </button>
            {query ? (
              <Link className="ghost link-button" href="/admin/ingestion">
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        <form className="form" action={bulkUpdateMetadataAction}>
          <div className="card table-card" data-select-group="ingested">
          <h2>Ingested transcripts</h2>
          {transcripts.length === 0 ? (
            <p className="subhead">No transcripts ingested yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <SelectAllCheckbox group="ingested" label="All" />
                  </th>
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
                    <td>
                      <input
                        className="checkbox"
                        type="checkbox"
                        name="selectedIds"
                        value={transcript.id}
                      />
                    </td>
                    <td>{transcript.title}</td>
                    <td>
                      <Link
                        className="ghost link-button"
                        href={`/admin/ingestion/${transcript.id}`}
                      >
                        Edit
                      </Link>
                      <Link
                        className="ghost link-button"
                        href={`/admin/ingestion/${transcript.id}/preview`}
                      >
                        Preview
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
                          <strong>Motifs:</strong>{" "}
                          {formatJsonList(transcript.themes_json)}
                        </span>
                        <span>
                          <strong>Locations:</strong>{" "}
                          {formatJsonList(transcript.locations_json)}
                        </span>
                        <span>
                          <strong>Warnings:</strong>{" "}
                          {formatJsonList(transcript.warnings_json)}
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

          {dbReady && transcripts.length > 0 ? (
            <div className="pagination">
              <div className="page-count">
                Page {pageNumber} of {totalPages}
              </div>
              <div className="actions">
                {pageNumber > 1 ? (
                  <Link
                    className="ghost link-button"
                    href={buildPageLink(pageNumber - 1)}
                  >
                    Previous
                  </Link>
                ) : null}
                {pageNumber < totalPages ? (
                  <Link
                    className="ghost link-button"
                    href={buildPageLink(pageNumber + 1)}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="card">
            <h2>Bulk metadata</h2>
            <p className="subhead">
              Apply metadata to selected transcripts. Empty fields are ignored unless
              you allow empty overwrite.
            </p>
            <label className="form-label" htmlFor="bulk_fears">
              Fears (comma-separated)
            </label>
            <input id="bulk_fears" name="bulk_fears" className="input" />

            <label className="form-label" htmlFor="bulk_cast">
              Cast (comma-separated)
            </label>
            <input id="bulk_cast" name="bulk_cast" className="input" />

            <label className="form-label" htmlFor="bulk_motifs">
              Motifs (comma-separated)
            </label>
            <input id="bulk_motifs" name="bulk_motifs" className="input" />

            <label className="form-label" htmlFor="bulk_locations">
              Locations (comma-separated)
            </label>
            <input id="bulk_locations" name="bulk_locations" className="input" />

            <label className="form-label" htmlFor="bulk_warnings">
              Content warnings (comma-separated)
            </label>
            <input id="bulk_warnings" name="bulk_warnings" className="input" />

            <label className="form-label" htmlFor="bulk_mode">
              Bulk mode
            </label>
            <select id="bulk_mode" name="bulk_mode" className="select" defaultValue="append">
              <option value="append">Append to existing</option>
              <option value="replace">Replace existing</option>
            </select>

            <label className="checkbox-row">
              <input type="checkbox" name="bulk_allow_empty" value="yes" />
              Allow empty fields to clear existing values
            </label>

            <div className="actions">
              <button className="primary" type="submit">
                Apply metadata to selected
              </button>
              <button className="ghost" formAction={batchAiSuggestAction}>
                Generate AI metadata (selected)
              </button>
              <div className="inline-form">
                <label className="form-label" htmlFor="ai_limit">
                  AI batch size (max 10)
                </label>
                <input
                  id="ai_limit"
                  name="ai_limit"
                  className="input"
                  defaultValue="5"
                />
              </div>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
