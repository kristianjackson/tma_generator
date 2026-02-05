import { requireDb } from "./db";

type Filters = {
  fears?: string[];
  cast?: string[];
  motifs?: string[];
  locations?: string[];
  warnings?: string[];
  length?: string;
  tone?: string;
  includeCast?: boolean;
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
  const castTokens = filters.includeCast === false ? [] : filters.cast ?? [];
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

    const castFilters =
      filters.includeCast === false ? [] : filters.cast ?? [];

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

  const selectedTranscripts = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.row);

  if (selectedTranscripts.length === 0) {
    return {
      context: "",
      sources: [] as string[]
    };
  }

  const transcriptMap = new Map(
    selectedTranscripts.map((row) => [row.id, row])
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

  const sources = scoredChunks.map((entry, index) => {
    const row = transcriptMap.get(entry.chunk.transcript_id);
    const label = row ? formatSourceLabel(row) : "Unknown source";
    return `[${index + 1}] ${label}\n${entry.chunk.content}`;
  });

  return {
    context: sources.join("\n\n"),
    sources
  };
};
