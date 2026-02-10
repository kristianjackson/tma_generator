import { requireDb } from "./db";

type Filters = {
  fears?: string[];
  cast?: string[];
  motifs?: string[];
  locations?: string[];
  warnings?: string[];
  length?: string;
  tone?: string;
  includeCast?: boolean | string;
  include_cast?: boolean | string;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "yes", "1", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
};

type TranscriptRow = {
  id: string;
  title: string;
  summary: string | null;
  episode: number | null;
  season: number | null;
  fears_json?: string | null;
  cast_json?: string | null;
  themes_json?: string | null;
  locations_json?: string | null;
  warnings_json?: string | null;
};

type ChunkRow = {
  transcript_id: string;
  content: string;
};

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

const normalizeToken = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const buildKeywordSet = (seed: string, filters: Filters) => {
  const tokens = new Set<string>();
  const seedTokens = normalizeToken(seed)
    .split(" ")
    .filter((token) => token.length > 3);

  seedTokens.forEach((token) => tokens.add(token));
  (filters.fears ?? []).forEach((item) => tokens.add(normalizeToken(item)));
  const includeCast = parseOptionalBoolean(
    filters.includeCast ?? filters.include_cast
  );
  const castTokens = includeCast === false ? [] : filters.cast ?? [];
  castTokens.forEach((item) => tokens.add(normalizeToken(item)));
  (filters.motifs ?? []).forEach((item) => tokens.add(normalizeToken(item)));
  (filters.locations ?? []).forEach((item) =>
    tokens.add(normalizeToken(item))
  );
  (filters.warnings ?? []).forEach((item) => tokens.add(normalizeToken(item)));

  return Array.from(tokens).filter(Boolean);
};

const hasAnyMatch = (values: string[], selected: string[]) => {
  if (selected.length === 0) {
    return true;
  }

  return selected.some((item) => values.includes(item));
};

const scoreByKeywords = (text: string, keywords: string[]) => {
  if (!text || keywords.length === 0) {
    return 0;
  }

  const normalized = normalizeToken(text);
  let score = 0;

  keywords.forEach((keyword) => {
    if (!keyword) {
      return;
    }
    if (normalized.includes(keyword)) {
      score += 1;
    }
  });

  return score;
};

const formatSourceLabel = (row: TranscriptRow) => {
  const episodeLabel = row.episode ? `MAG ${row.episode}` : "MAG ?";
  return `${episodeLabel} — ${row.title}`;
};

export const buildTranscriptContext = async (seed: string, filters: Filters) => {
  const db = requireDb();
  const result = await db
    .prepare(
      `SELECT t.id, t.title, t.summary, t.episode, t.season,
        m.fears_json, m.cast_json, m.themes_json, m.locations_json, m.warnings_json
       FROM transcripts t
       LEFT JOIN transcript_metadata m ON t.id = m.transcript_id`
    )
    .bind()
    .all<TranscriptRow>();

  const candidates = result.results.map((row) => {
    const fears = parseJsonList(row.fears_json);
    const cast = parseJsonList(row.cast_json);
    const motifs = parseJsonList(row.themes_json);
    const locations = parseJsonList(row.locations_json);
    const warnings = parseJsonList(row.warnings_json);

    const includeCast = parseOptionalBoolean(
      filters.includeCast ?? filters.include_cast
    );
    const castFilters = includeCast === false ? [] : filters.cast ?? [];

    const matchesFilters =
      hasAnyMatch(fears, filters.fears ?? []) &&
      hasAnyMatch(cast, castFilters) &&
      hasAnyMatch(motifs, filters.motifs ?? []) &&
      hasAnyMatch(locations, filters.locations ?? []) &&
      hasAnyMatch(warnings, filters.warnings ?? []);

    return {
      row,
      fears,
      cast,
      motifs,
      locations,
      warnings,
      matchesFilters
    };
  });

  const keywordSet = buildKeywordSet(seed, filters);
  const filtered = candidates.filter((item) => item.matchesFilters);

  const scored = (filtered.length > 0 ? filtered : candidates).map((item) => {
    const score =
      scoreByKeywords(item.row.title, keywordSet) +
      scoreByKeywords(item.row.summary ?? "", keywordSet) +
      scoreByKeywords(item.fears.join(" "), keywordSet) +
      scoreByKeywords(item.cast.join(" "), keywordSet) +
      scoreByKeywords(item.motifs.join(" "), keywordSet) +
      scoreByKeywords(item.locations.join(" "), keywordSet) +
      scoreByKeywords(item.warnings.join(" "), keywordSet);
    return { ...item, score };
  });

  const selectedCandidates = scored.sort((a, b) => b.score - a.score).slice(0, 6);
  const selectedTranscripts = selectedCandidates.map((item) => item.row);

  if (selectedTranscripts.length === 0) {
    return {
      context: "",
      sources: [] as string[],
      forbiddenTerms: [] as string[]
    };
  }

  const transcriptMap = new Map(selectedTranscripts.map((row) => [row.id, row]));
  const candidateMap = new Map(
    selectedCandidates.map((candidate) => [candidate.row.id, candidate])
  );
  const placeholders = selectedTranscripts.map(() => "?").join(", ");
  const chunkResult = await db
    .prepare(
      `SELECT transcript_id, content FROM transcript_chunks WHERE transcript_id IN (${placeholders})`
    )
    .bind(...selectedTranscripts.map((row) => row.id))
    .all<ChunkRow>();

  const scoredChunks = chunkResult.results
    .map((chunk) => ({
      chunk,
      score: scoreByKeywords(chunk.content, keywordSet)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const maxChunkScore = scoredChunks.reduce(
    (max, entry) => Math.max(max, entry.score),
    0
  );

  const forbiddenTerms = Array.from(
    new Set(
      selectedCandidates
        .flatMap((candidate) => [
          ...candidate.cast,
          candidate.row.title,
          ...(candidate.row.summary ? [candidate.row.summary] : [])
        ])
        .flatMap((value) =>
          value
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter((item) => item.length > 2 && item.length < 80)
        )
    )
  ).slice(0, 80);

  if (maxChunkScore === 0) {
    const styleReferences = selectedCandidates.map((candidate, index) => {
      const fears =
        candidate.fears.length > 0 ? candidate.fears.join(", ") : "unspecified";
      const motifs =
        candidate.motifs.length > 0 ? candidate.motifs.join(", ") : "unspecified";
      const warnings =
        candidate.warnings.length > 0
          ? candidate.warnings.join(", ")
          : "unspecified";
      return [
        `[${index + 1}]`,
        `Fears: ${fears}`,
        `Motifs: ${motifs}`,
        `Content warnings: ${warnings}`
      ].join("\n");
    });

    const context = [
      "Style references from corpus metadata (for tone and pacing only).",
      "Do not copy names, entities, locations, or plot beats from source episodes.",
      styleReferences.join("\n\n")
    ].join("\n\n");

    return {
      context,
      sources: styleReferences,
      forbiddenTerms
    };
  }

  const sources = scoredChunks.map((entry, index) => {
    const row = transcriptMap.get(entry.chunk.transcript_id);
    const label = row ? formatSourceLabel(row) : "Unknown source";
    const metadata = candidateMap.get(entry.chunk.transcript_id);
    const fears =
      metadata && metadata.fears.length > 0
        ? metadata.fears.join(", ")
        : "unspecified";
    return [
      `[${index + 1}] ${label}`,
      `Fears: ${fears}`,
      entry.chunk.content
    ].join("\n");
  });

  return {
    context: [
      "Reference excerpts (style only; do not copy names, entities, locations, or plot beats):",
      sources.join("\n\n")
    ].join("\n\n"),
    sources,
    forbiddenTerms
  };
};
