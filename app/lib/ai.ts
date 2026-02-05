import { getCloudflareContext } from "@opennextjs/cloudflare";

type AiBinding = {
  run: (model: string, options: unknown) => Promise<unknown>;
};

type AiSuggestion = {
  summary?: string;
  fears?: string[];
  cast?: string[];
  motifs?: string[];
  themes?: string[];
  locations?: string[];
};

const getAiBinding = () => {
  try {
    const context = getCloudflareContext();
    return (context?.env as { AI?: AiBinding } | undefined)?.AI;
  } catch {
    return undefined;
  }
};

const getAiModel = () => {
  try {
    const context = getCloudflareContext();
    return (
      (context?.env as { AI_MODEL?: string } | undefined)?.AI_MODEL ??
      "@cf/meta/llama-3.1-8b-instruct"
    );
  } catch {
    return "@cf/meta/llama-3.1-8b-instruct";
  }
};

const runAiChat = async (
  messages: Array<{ role: string; content: string }>,
  options: Record<string, unknown> = {}
) => {
  const ai = getAiBinding();
  if (!ai) {
    throw new Error("AI binding not configured.");
  }

  const model = getAiModel();
  const result = await ai.run(model, {
    messages,
    temperature: 0.7,
    max_tokens: 1400,
    ...options
  });

  return extractText(result);
};

const extractText = (result: unknown) => {
  if (!result) {
    return "";
  }
  if (typeof result === "string") {
    return result;
  }

  const record = result as Record<string, unknown>;

  if (typeof record.response === "string") {
    return record.response;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.result === "string") {
    return record.result;
  }

  if (Array.isArray(record.output)) {
    return record.output.map(String).join("\n");
  }

  return JSON.stringify(result);
};

const extractJson = (text: string): AiSuggestion | null => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const FEAR_CANONICAL = [
  "The Beholding",
  "The Buried",
  "The Corruption",
  "The Dark",
  "The Desolation",
  "The End",
  "The Extinction",
  "The Flesh",
  "The Hunt",
  "The Lonely",
  "The Slaughter",
  "The Spiral",
  "The Stranger",
  "The Vast",
  "The Web"
];

const FEAR_LOOKUP = new Map(
  FEAR_CANONICAL.flatMap((fear) => {
    const normalized = fear.toLowerCase().replace(/^the\s+/, "");
    return [
      [fear.toLowerCase(), fear],
      [normalized, fear]
    ];
  })
);

const MAX_FEARS = 3;

const normalizeFears = (values?: string[]) => {
  if (!values) {
    return [] as string[];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/[^a-z]+/g, " ")
      .trim();
    const canonical = FEAR_LOOKUP.get(normalized);
    if (canonical && !seen.has(canonical)) {
      result.push(canonical);
      seen.add(canonical);
      if (result.length >= MAX_FEARS) {
        break;
      }
    }
  }

  return result;
};

const cleanSummary = (summary?: string) => {
  if (!summary) {
    return "";
  }

  return summary
    .replace(
      /^(A|An)\s+(researcher|archivist).*?investigates\s+/i,
      ""
    )
    .replace(/^The Magnus Institute investigates\s+/i, "")
    .trim();
};

const truncateTranscript = (content: string, maxChars = 12000) => {
  if (content.length <= maxChars) {
    return content;
  }

  const head = content.slice(0, Math.floor(maxChars * 0.7));
  const tail = content.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[...]\n\n${tail}`;
};

export const suggestMetadata = async (title: string, content: string) => {
  const prompt = `You are tagging The Magnus Archives transcripts.
Return JSON with keys: summary, fears, cast, motifs, locations.
- summary: 1-2 sentences, do NOT start with "A researcher at the Magnus Institute investigates..."
- fears: choose 0-3 from the canonical 14 fears: ${FEAR_CANONICAL.join(", ")}.
  Usually 1-2 fears is correct. Order fears by strongest evidence. Never list more than 3.
- cast/locations: proper names only if explicitly referenced.
- motifs: optional; return [] if not confident.
Return JSON only.`;

  const input = truncateTranscript(content);
  const text = await runAiChat([
    { role: "system", content: prompt },
    {
      role: "user",
      content: `Title: ${title}\n\nTranscript:\n${input}`
    }
  ]);
  const parsed = extractJson(text);

  if (!parsed) {
    throw new Error("AI response could not be parsed.");
  }

  const fears = Array.isArray(parsed.fears) ? parsed.fears : [];
  const motifs = parsed.motifs ?? parsed.themes ?? [];

  return {
    summary: cleanSummary(parsed.summary),
    fears: normalizeFears(fears),
    cast: parsed.cast,
    motifs,
    locations: parsed.locations
  };
};

export const generateOutline = async (input: {
  seed: string;
  filters: Record<string, unknown>;
  context: string;
  notes?: string;
}) => {
  const filters = input.filters as {
    tone?: string;
    length?: string;
    includeCast?: boolean;
    cast?: string[];
    brief?: string | null;
  };

  const toneMap: Record<string, string> = {
    classic: "Classic TMA: archival, understated, formal statement voice.",
    modern: "Modern horror: sharper pacing, cinematic clarity, restrained dialogue.",
    experimental: "Experimental: fragmented, unsettling pacing, uncanny transitions."
  };

  const toneNote =
    filters.tone && toneMap[filters.tone]
      ? toneMap[filters.tone]
      : "Classic TMA: archival, understated, formal statement voice.";

  const lengthNote =
    filters.length === "short"
      ? "Short outline: aim for 2,000-3,000 words in the final draft."
      : filters.length === "long"
        ? "Long outline: aim for 10,000+ words in the final draft."
        : "Episode outline: aim for 6,000-9,000 words in the final draft.";

  const castNote =
    filters.includeCast === false
      ? "Avoid established Magnus Institute cast. Use new names only."
      : (filters.cast ?? []).length > 0
        ? "You may include 1-2 named cast members from the selected list."
        : "Keep cast minimal unless needed.";

  const prompt = `You are writing a Magnus Archives style episode outline.
Use the provided transcript excerpts for tone and structure.
Tone: ${toneNote}
Length guidance: ${lengthNote}
Cast guidance: ${castNote}
Return a clear numbered outline with 5-7 sections, each with 2-4 bullet points.
Avoid meta commentary.`;

  const filterNotes = Object.entries(input.filters)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${(value as string[]).join(", ")}`)
    .join("\n");
  const runBrief =
    typeof filters.brief === "string" && filters.brief.trim().length > 0
      ? `Run brief:\n${filters.brief.trim()}`
      : "";
  const notesBlock = [runBrief, input.notes ? `Notes:\n${input.notes}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return runAiChat(
    [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Seed:\n${input.seed}\n\nFilters:\n${
          filterNotes || "none"
        }\n\n${notesBlock ? `${notesBlock}\n\n` : ""}Transcript excerpts:\n${input.context}`
      }
    ],
    { max_tokens: 900 }
  );
};

export const generateDraft = async (input: {
  seed: string;
  outline: string;
  filters: Record<string, unknown>;
  context: string;
  notes?: string;
}) => {
  const filters = input.filters as {
    tone?: string;
    length?: string;
    includeCast?: boolean;
    cast?: string[];
    brief?: string | null;
  };

  const toneMap: Record<string, string> = {
    classic: "Classic TMA: archival, understated, formal statement voice.",
    modern: "Modern horror: sharper pacing, cinematic clarity, restrained dialogue.",
    experimental: "Experimental: fragmented, unsettling pacing, uncanny transitions."
  };

  const toneNote =
    filters.tone && toneMap[filters.tone]
      ? toneMap[filters.tone]
      : "Classic TMA: archival, understated, formal statement voice.";

  const lengthNote =
    filters.length === "short"
      ? "Target 2,000-3,000 words."
      : filters.length === "long"
        ? "Target 10,000+ words."
        : "Target 6,000-9,000 words.";

  const castNote =
    filters.includeCast === false
      ? "Avoid established Magnus Institute cast. Use new names only."
      : (filters.cast ?? []).length > 0
        ? "You may include 1-2 named cast members from the selected list."
        : "Keep cast minimal unless needed.";

  const prompt = `You are writing a Magnus Archives style episode draft.
Use the outline and transcript excerpts for tone, pacing, and voice.
Tone: ${toneNote}
Length guidance: ${lengthNote}
Cast guidance: ${castNote}
Write in the voice of a formal statement and archival notes.`;

  const filterNotes = Object.entries(input.filters)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${(value as string[]).join(", ")}`)
    .join("\n");
  const runBrief =
    typeof filters.brief === "string" && filters.brief.trim().length > 0
      ? `Run brief:\n${filters.brief.trim()}`
      : "";
  const notesBlock = [runBrief, input.notes ? `Notes:\n${input.notes}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return runAiChat(
    [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Seed:\n${input.seed}\n\nFilters:\n${
          filterNotes || "none"
        }\n\n${notesBlock ? `${notesBlock}\n\n` : ""}Outline:\n${input.outline}\n\nTranscript excerpts:\n${input.context}`
      }
    ],
    { max_tokens: 2000 }
  );
};
