import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isNarrativeDraftOutput } from "./draft-shape";
import { allowsCanonCarryover, allowsCastCarryover } from "./canon-policy";

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

const truncateForSize = (content: string, maxChars: number) => {
  if (content.length <= maxChars) {
    return content;
  }

  const head = content.slice(0, Math.floor(maxChars * 0.7));
  const tail = content.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[...]\n\n${tail}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isContextLimitError = (message: string) => {
  const normalized = message.toLowerCase();
  return [
    "maximum context length",
    "context window",
    "token limit",
    "too many tokens",
    "prompt too long",
    "input too long"
  ].some((needle) => normalized.includes(needle));
};

const isTransientAiError = (message: string) => {
  const normalized = message.toLowerCase();
  return [
    "rate limit",
    "temporarily unavailable",
    "overloaded",
    "try again",
    "internal error"
  ].some((needle) => normalized.includes(needle));
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
  const maxTokens =
    typeof options.max_tokens === "number" ? options.max_tokens : 1400;
  const baseOptions = {
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    ...options
  };

  try {
    const result = await ai.run(model, baseOptions);
    return extractText(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");

    if (isContextLimitError(message)) {
      const reducedMessages = messages.map((entry) =>
        entry.role === "user"
          ? { ...entry, content: truncateForSize(entry.content, 12000) }
          : entry
      );
      const result = await ai.run(model, {
        ...baseOptions,
        messages: reducedMessages,
        max_tokens: Math.min(maxTokens, 1200)
      });
      return extractText(result);
    }

    if (isTransientAiError(message)) {
      await sleep(300);
      const result = await ai.run(model, baseOptions);
      return extractText(result);
    }

    throw error;
  }
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

const CANON_CAST_TERMS = [
  "jonathan sims",
  "elias bouchard",
  "gertrude robinson",
  "martin blackwood",
  "tim stoker",
  "sasha james"
];

const CANON_NON_CAST_TERMS = [
  "magnus institute",
  "adelard dekker",
  "not sasha",
  "the distortion",
  "michael",
  "nikola orsinov",
  "jane prentiss",
  "breekon and hope",
  "old fishmarket close",
  "hill top road",
  "artifact storage",
  "statement begins",
  "statement ends",
  "end recording",
  "the magnus archives"
];

const normalizeForMatch = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const resolveAllowedCastTerms = (selectedCast: string[] | undefined) => {
  const selected = (selectedCast ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (selected.length === 0) {
    return [...CANON_CAST_TERMS];
  }

  const normalizedSelected = selected.map(normalizeForMatch);
  const allowlist = new Set<string>();

  for (const castName of CANON_CAST_TERMS) {
    const normalizedCastName = normalizeForMatch(castName);
    for (const selectedName of normalizedSelected) {
      if (
        normalizedCastName === selectedName ||
        normalizedCastName.includes(selectedName) ||
        selectedName.includes(normalizedCastName)
      ) {
        allowlist.add(castName);
      }
    }
  }

  for (const selectedName of selected) {
    allowlist.add(selectedName);
  }

  return Array.from(allowlist);
};

const buildForbiddenTerms = (
  extra: string[] | undefined,
  options: {
    allowCanon: boolean;
    allowCast: boolean;
    allowedCastTerms?: string[];
  }
) => {
  if (options.allowCanon) {
    return [] as string[];
  }

  const allowedCastTerms = options.allowCast
    ? options.allowedCastTerms ?? []
    : [];
  const allowedCastLookup = new Set(allowedCastTerms.map(normalizeForMatch));

  const coreTerms = [
    ...CANON_NON_CAST_TERMS,
    ...CANON_CAST_TERMS.filter(
      (term) => !allowedCastLookup.has(normalizeForMatch(term))
    )
  ];

  const contextTerms = (extra ?? []).filter((item) => {
    const normalized = normalizeForMatch(item);
    return !allowedCastLookup.has(normalized);
  });

  return Array.from(
    new Set(
      [...coreTerms, ...contextTerms]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 120);
};

const SEED_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "an",
  "and",
  "are",
  "around",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "does",
  "each",
  "for",
  "from",
  "have",
  "into",
  "just",
  "like",
  "maybe",
  "more",
  "most",
  "need",
  "only",
  "over",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "this",
  "those",
  "through",
  "under",
  "upon",
  "very",
  "want",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your"
]);

const extractSeedAnchors = (seed: string, notes?: string) => {
  const source = `${seed}\n${notes ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ");
  const words = source.split(/\s+/).filter(Boolean);
  const anchors: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    if (word.length < 4) {
      continue;
    }
    if (SEED_STOPWORDS.has(word)) {
      continue;
    }
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    anchors.push(word);
    if (anchors.length >= 12) {
      break;
    }
  }

  return anchors;
};

const getSeedAnchorCoverage = (text: string, anchors: string[]) => {
  const normalizedText = normalizeForMatch(text);
  let matched = 0;

  for (const anchor of anchors) {
    if (normalizedText.includes(anchor)) {
      matched += 1;
    }
  }

  const required = anchors.length >= 8 ? 3 : anchors.length >= 4 ? 2 : 1;
  return { matched, required };
};

const ensureSeedAnchoredOutput = async (input: {
  kind: "outline" | "draft";
  seed: string;
  notes?: string;
  text: string;
  forbiddenTerms: string[];
  outline?: string;
}) => {
  const anchors = extractSeedAnchors(input.seed, input.notes);
  if (anchors.length === 0) {
    return input.text;
  }

  let nextText = input.text;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const coverage = getSeedAnchorCoverage(nextText, anchors);
    if (coverage.matched >= coverage.required) {
      return nextText;
    }

    if (attempt === 1) {
      break;
    }

    nextText = await runAiChat(
      [
        {
          role: "system",
          content:
            input.kind === "outline"
              ? "Rewrite the outline so it stays strictly anchored to the seed premise. Keep the format as a numbered 5-7 section outline with 2-4 bullets per section."
              : "Rewrite the draft so it stays strictly anchored to the seed premise. Keep full prose narrative output only."
        },
        {
          role: "user",
          content: `Seed:
${input.seed}

${input.notes ? `Notes:\n${input.notes}\n\n` : ""}Mandatory seed anchors that must be clearly reflected:
${anchors.join(", ")}

${input.outline ? `Outline to preserve:\n${truncateForSize(input.outline, 5000)}\n\n` : ""}Previous output drifted off-seed. Rewrite it so the central conflict and details clearly match the seed anchors.

Previous output:
${truncateForSize(nextText, 5000)}`
        }
      ],
      {
        max_tokens: input.kind === "outline" ? 820 : 2200,
        temperature: 0.65
      }
    );

    const forbiddenMatches = collectForbiddenMatches(
      nextText,
      input.forbiddenTerms
    );
    if (forbiddenMatches.length > 0) {
      throw new Error(
        `Output contained forbidden canon terms: ${forbiddenMatches.join(", ")}`
      );
    }
  }

  throw new Error("Output drifted from seed premise and was rejected.");
};

const collectForbiddenMatches = (text: string, terms: string[]) => {
  if (!text || terms.length === 0) {
    return [] as string[];
  }

  const normalizedText = normalizeForMatch(text);
  const matches: string[] = [];

  for (const term of terms) {
    const normalizedTerm = normalizeForMatch(term);
    if (normalizedTerm.length < 3) {
      continue;
    }
    if (normalizedText.includes(normalizedTerm)) {
      matches.push(term);
      if (matches.length >= 10) {
        break;
      }
    }
  }

  return matches;
};

const generateWithCanonGuard = async (input: {
  buildMessages: (matches: string[]) => Array<{ role: string; content: string }>;
  options: Record<string, unknown>;
  forbiddenTerms: string[];
  maxAttempts?: number;
  onFailure?: (input: {
    matches: string[];
    lastText: string;
  }) => Promise<string>;
}) => {
  if (input.forbiddenTerms.length === 0) {
    return runAiChat(input.buildMessages([]), input.options);
  }

  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  let matches: string[] = [];
  let lastText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastText = await runAiChat(input.buildMessages(matches), input.options);
    matches = collectForbiddenMatches(lastText, input.forbiddenTerms);
    if (matches.length === 0) {
      return lastText;
    }
  }

  if (input.onFailure) {
    const fallbackText = await input.onFailure({ matches, lastText });
    const fallbackMatches = collectForbiddenMatches(
      fallbackText,
      input.forbiddenTerms
    );
    if (fallbackMatches.length === 0) {
      return fallbackText;
    }

    matches = fallbackMatches;
  }

  throw new Error(`Output contained forbidden canon terms: ${matches.join(", ")}`);
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
  return truncateForSize(content, maxChars);
};

const parseIncludeCastFilter = (value: unknown): boolean | undefined => {
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
  forbiddenTerms?: string[];
  notes?: string;
}) => {
  const filters = input.filters as {
    tone?: string;
    length?: string;
    includeCast?: boolean | string;
    include_cast?: boolean | string;
    allowCanon?: boolean | string;
    allow_canon?: boolean | string;
    cast?: string[];
    brief?: string | null;
  };

  const includeCast = parseIncludeCastFilter(
    filters.includeCast ?? filters.include_cast
  );
  const allowCanon = parseIncludeCastFilter(
    filters.allowCanon ?? filters.allow_canon
  );

  const canonCarryoverAllowed = allowsCanonCarryover({
    seed: input.seed,
    notes: input.notes,
    allowCanon: allowCanon === true,
    includeCast,
    include_cast: filters.include_cast,
    cast: filters.cast
  });
  const castCarryoverAllowed = allowsCastCarryover({
    seed: input.seed,
    notes: input.notes,
    includeCast,
    include_cast: filters.include_cast,
    cast: filters.cast
  });
  const allowedCastTerms = castCarryoverAllowed
    ? resolveAllowedCastTerms(filters.cast)
    : [];

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
    includeCast === false
      ? "Avoid established Magnus Institute cast. Use new names only."
      : (filters.cast ?? []).length > 0
        ? "You may include 1-2 named cast members from the selected list."
        : "Keep cast minimal unless needed.";
  const canonNote = canonCarryoverAllowed
    ? "Direct canon references are allowed because continuation mode is enabled."
    : castCarryoverAllowed
      ? "Cast names may be reused, but canon entities, artifacts, and episode events are still forbidden."
      : "Do not use canon character names, entity names, locations, artifacts, or direct callbacks from provided excerpts.";

  const prompt = `You are writing a Magnus Archives style episode outline.
Use the provided transcript excerpts for tone and structure.
Tone: ${toneNote}
Length guidance: ${lengthNote}
Cast guidance: ${castNote}
Premise lock: the seed idea is mandatory and must drive the episode conflict.
Originality rule: keep this story novel. Do not reuse canon episode plots or copy transcript events.
Canon rule: ${
    canonNote
  }
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

  const forbiddenTerms = buildForbiddenTerms(input.forbiddenTerms, {
    allowCanon: canonCarryoverAllowed,
    allowCast: castCarryoverAllowed,
    allowedCastTerms
  });
  const forbiddenBlock =
    forbiddenTerms.length > 0
      ? `Forbidden terms and canon references (must not appear): ${forbiddenTerms
          .slice(0, 80)
          .join(", ")}`
      : "";

  const outlineText = await generateWithCanonGuard({
    forbiddenTerms,
    options: { max_tokens: 780 },
    maxAttempts: 2,
    onFailure: async ({ matches, lastText }) => {
      return runAiChat(
        [
          {
            role: "system",
            content:
              "You write original horror episode outlines in a Magnus-inspired style. Do not use canon names, entities, locations, or plot callbacks. Produce a clean, original outline only."
          },
          {
            role: "user",
            content: `Seed:
${input.seed}

${notesBlock ? `${notesBlock}\n\n` : ""}${forbiddenBlock ? `${forbiddenBlock}\n\n` : ""}Previous attempt reused blocked terms: ${matches.join(", ")}.
Rewrite it so all names, entities, places, and events are original.

Return exactly a numbered outline with 5-7 sections and 2-4 bullets each.

Previous attempt:
${truncateForSize(lastText, 4000)}`
          }
        ],
        { max_tokens: 780, temperature: 0.65 }
      );
    },
    buildMessages: (matches) => [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Seed:\n${input.seed}\n\nFilters:\n${
          filterNotes || "none"
        }\n\n${notesBlock ? `${notesBlock}\n\n` : ""}${forbiddenBlock ? `${forbiddenBlock}\n\n` : ""}Non-negotiable constraints:
- Build around the seed premise directly.
- Use transcript context for style only, never as plot source material.
- Keep events, entities, and names original unless continuation is explicitly requested.
${matches.length > 0 ? `- Retry rule: your previous attempt reused forbidden terms (${matches.join(", ")}). Regenerate with fully original names/entities/events.\n` : ""}

Transcript references:\n${input.context}`
      }
    ],
  });

  return ensureSeedAnchoredOutput({
    kind: "outline",
    seed: input.seed,
    notes: input.notes,
    text: outlineText,
    forbiddenTerms
  });
};

export const generateDraft = async (input: {
  seed: string;
  outline: string;
  filters: Record<string, unknown>;
  context: string;
  forbiddenTerms?: string[];
  notes?: string;
}) => {
  const filters = input.filters as {
    tone?: string;
    length?: string;
    includeCast?: boolean | string;
    include_cast?: boolean | string;
    allowCanon?: boolean | string;
    allow_canon?: boolean | string;
    cast?: string[];
    brief?: string | null;
  };

  const includeCast = parseIncludeCastFilter(
    filters.includeCast ?? filters.include_cast
  );
  const allowCanon = parseIncludeCastFilter(
    filters.allowCanon ?? filters.allow_canon
  );

  const canonCarryoverAllowed = allowsCanonCarryover({
    seed: input.seed,
    notes: input.notes,
    allowCanon: allowCanon === true,
    includeCast,
    include_cast: filters.include_cast,
    cast: filters.cast
  });
  const castCarryoverAllowed = allowsCastCarryover({
    seed: input.seed,
    notes: input.notes,
    includeCast,
    include_cast: filters.include_cast,
    cast: filters.cast
  });
  const allowedCastTerms = castCarryoverAllowed
    ? resolveAllowedCastTerms(filters.cast)
    : [];

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
    includeCast === false
      ? "Avoid established Magnus Institute cast. Use new names only."
      : (filters.cast ?? []).length > 0
        ? "You may include 1-2 named cast members from the selected list."
        : "Keep cast minimal unless needed.";
  const canonNote = canonCarryoverAllowed
    ? "Direct canon references are allowed because continuation mode is enabled."
    : castCarryoverAllowed
      ? "Cast names may be reused, but canon entities, artifacts, and episode events are still forbidden."
      : "Do not use canon character names, entity names, locations, artifacts, or direct callbacks from provided excerpts.";

  const prompt = `You are writing a Magnus Archives style episode draft.
Use the outline and transcript excerpts for tone, pacing, and voice.
Tone: ${toneNote}
Length guidance: ${lengthNote}
Cast guidance: ${castNote}
Premise lock: the seed premise and the provided outline are mandatory.
Originality rule: keep this story novel. Do not copy plot beats, scenes, entities, or phrasing from transcript references.
Canon rule: ${
    canonNote
  }
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

  const forbiddenTerms = buildForbiddenTerms(input.forbiddenTerms, {
    allowCanon: canonCarryoverAllowed,
    allowCast: castCarryoverAllowed,
    allowedCastTerms
  });
  const forbiddenBlock =
    forbiddenTerms.length > 0
      ? `Forbidden terms and canon references (must not appear): ${forbiddenTerms
          .slice(0, 80)
          .join(", ")}`
      : "";

  let draftText = await generateWithCanonGuard({
    forbiddenTerms,
    options: { max_tokens: 2200 },
    maxAttempts: 2,
    onFailure: async ({ matches, lastText }) => {
      return runAiChat(
        [
          {
            role: "system",
            content:
              "You write original horror drafts in a Magnus-inspired archival style. Do not use canon names, entities, locations, or reused scene structure."
          },
          {
            role: "user",
            content: `Seed:
${input.seed}

${notesBlock ? `${notesBlock}\n\n` : ""}${forbiddenBlock ? `${forbiddenBlock}\n\n` : ""}Outline:
${truncateForSize(input.outline, 7000)}

Previous attempt reused blocked terms: ${matches.join(", ")}.
Rewrite it to be fully original while preserving the seed and outline.

Previous attempt:
${truncateForSize(lastText, 5000)}`
          }
        ],
        { max_tokens: 2200, temperature: 0.65 }
      );
    },
    buildMessages: (matches) => [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Seed:\n${input.seed}\n\nFilters:\n${
          filterNotes || "none"
        }\n\n${notesBlock ? `${notesBlock}\n\n` : ""}${forbiddenBlock ? `${forbiddenBlock}\n\n` : ""}Outline:\n${truncateForSize(
          input.outline,
          7000
        )}\n\nNon-negotiable constraints:
- Keep the seed premise central to every major section.
- Use transcript references for style only, never as a source of plot or names.
- Keep events, entities, and names original unless continuation is explicitly requested.
${matches.length > 0 ? `- Retry rule: your previous attempt reused forbidden terms (${matches.join(", ")}). Regenerate with fully original names/entities/events.\n` : ""}

Transcript references:\n${truncateForSize(input.context, 9000)}`
      }
    ],
  });

  if (isNarrativeDraftOutput(draftText)) {
    return ensureSeedAnchoredOutput({
      kind: "draft",
      seed: input.seed,
      notes: input.notes,
      text: draftText,
      forbiddenTerms,
      outline: input.outline
    });
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    draftText = await generateWithCanonGuard({
      forbiddenTerms,
      options: { max_tokens: 2200, temperature: 0.65 },
      maxAttempts: 2,
      buildMessages: (matches) => [
        {
          role: "system",
          content:
            "Rewrite the text as full narrative prose in statement form. Do not return an outline, section headings, bullets, screenplay formatting, or stage directions."
        },
        {
          role: "user",
          content: `Seed:
${input.seed}

${notesBlock ? `${notesBlock}\n\n` : ""}${forbiddenBlock ? `${forbiddenBlock}\n\n` : ""}Outline:
${truncateForSize(input.outline, 7000)}

Rewrite target:
- Output only story prose.
- No headings like "Section 1", no bullet/number lists.
- No screenplay formatting (NAME: dialogue) and no stage directions in brackets.
- Keep the seed and outline events intact.
${matches.length > 0 ? `- Retry rule: your previous attempt reused forbidden terms (${matches.join(", ")}). Regenerate with fully original names/entities/events.\n` : ""}

Previous non-compliant attempt:
${truncateForSize(draftText, 5000)}`
        }
      ]
    });

    if (isNarrativeDraftOutput(draftText)) {
      return ensureSeedAnchoredOutput({
        kind: "draft",
        seed: input.seed,
        notes: input.notes,
        text: draftText,
        forbiddenTerms,
        outline: input.outline
      });
    }
  }

  throw new Error("AI returned outline/script output instead of full prose draft.");
};
