import { requireDb } from "./db";

type TranscriptMetaRow = {
  fears_json?: string | null;
  cast_json?: string | null;
  themes_json?: string | null;
  tags_json?: string | null;
  locations_json?: string | null;
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

export const getTranscriptFilters = async () => {
  const db = requireDb();
  const result = await db
    .prepare(
      "SELECT fears_json, cast_json, themes_json, tags_json, locations_json FROM transcript_metadata"
    )
    .bind()
    .all<TranscriptMetaRow>();

  const fears = new Set<string>();
  const cast = new Set<string>();
  const themes = new Set<string>();
  const tags = new Set<string>();
  const locations = new Set<string>();

  result.results.forEach((row) => {
    parseJsonList(row.fears_json).forEach((item) => fears.add(item));
    parseJsonList(row.cast_json).forEach((item) => cast.add(item));
    parseJsonList(row.themes_json).forEach((item) => themes.add(item));
    parseJsonList(row.tags_json).forEach((item) => tags.add(item));
    parseJsonList(row.locations_json).forEach((item) => locations.add(item));
  });

  return {
    fears: Array.from(fears).sort(),
    cast: Array.from(cast).sort(),
    themes: Array.from(themes).sort(),
    tags: Array.from(tags).sort(),
    locations: Array.from(locations).sort()
  };
};
