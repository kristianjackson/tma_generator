import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireDb } from "@/app/lib/db";

type SearchParams = {
  q?: string | string[];
};

type TranscriptPreviewRow = {
  id: string;
  title: string;
  season: number | null;
  episode: number | null;
  content: string;
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text: string, query: string) => {
  if (!query) {
    return text;
  }

  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index}>{part}</mark>
    ) : (
      part
    )
  );
};

export default async function TranscriptPreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const query = getFirstValue(resolvedSearchParams?.q)?.trim() ?? "";

  const db = requireDb();
  const transcript = await db
    .prepare(
      "SELECT id, title, season, episode, content FROM transcripts WHERE id = ?"
    )
    .bind(id)
    .first<TranscriptPreviewRow>();

  if (!transcript) {
    notFound();
  }

  return (
    <main className="page">
      <section className="hero hero-wide">
        <p className="eyebrow">Admin</p>
        <div className="admin-header">
          <h1>Transcript preview</h1>
          <div className="actions">
            <Link className="ghost link-button" href="/admin/ingestion">
              Back to ingestion
            </Link>
            <Link className="ghost link-button" href={`/admin/ingestion/${id}`}>
              Edit metadata
            </Link>
          </div>
        </div>
        <p className="subhead">
          {transcript.title}{" "}
          {transcript.episode ? `(Episode ${transcript.episode})` : ""}
        </p>

        <div className="card">
          <h2>Search within transcript</h2>
          <form className="search" method="get">
            <input
              className="input"
              name="q"
              placeholder="Search within this transcript..."
              defaultValue={query}
            />
            <button className="ghost link-button" type="submit">
              Search
            </button>
            {query ? (
              <Link className="ghost link-button" href={`/admin/ingestion/${id}/preview`}>
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        <div className="card">
          <h2>Transcript</h2>
          <pre className="code-block transcript-preview">
            {highlightText(transcript.content, query)}
          </pre>
        </div>
      </section>
    </main>
  );
}
