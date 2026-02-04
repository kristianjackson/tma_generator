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

const normalizeFears = (values?: string[]) => {
  if (!values) {
    return [] as string[];
  }

  const result = new Set<string>();

  values.forEach((value) => {
    const normalized = value
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/[^a-z]+/g, " ")
      .trim();
    const canonical = FEAR_LOOKUP.get(normalized);
    if (canonical) {
      result.add(canonical);
    }
  });

  return Array.from(result);
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
- fears: ONLY use the canonical 14 fears: ${FEAR_CANONICAL.join(", ")}.
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

  const motifs = parsed.motifs ?? parsed.themes ?? [];

  return {
    summary: cleanSummary(parsed.summary),
    fears: normalizeFears(parsed.fears),
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
  const prompt = `You are writing a Magnus Archives style episode outline.
Use the provided transcript excerpts for tone and structure.
Return a clear numbered outline with 5-7 sections, each with 2-4 bullet points.
Avoid meta commentary.`;

  const filterNotes = Object.entries(input.filters)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${(value as string[]).join(", ")}`)
    .join("\n");
  const notesBlock = input.notes ? `Notes:\n${input.notes}` : "";

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
  const prompt = `You are writing a Magnus Archives style episode draft.
Use the outline and transcript excerpts for tone, pacing, and voice.
Write in the voice of a formal statement and archival notes.
Aim for 1500-2500 words in this pass.`;

  const filterNotes = Object.entries(input.filters)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${(value as string[]).join(", ")}`)
    .join("\n");
  const notesBlock = input.notes ? `Notes:\n${input.notes}` : "";

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
