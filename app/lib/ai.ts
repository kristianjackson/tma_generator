import { getCloudflareContext } from "@opennextjs/cloudflare";

type AiBinding = {
  run: (model: string, options: unknown) => Promise<unknown>;
};

type AiSuggestion = {
  summary?: string;
  fears?: string[];
  cast?: string[];
  themes?: string[];
  tags?: string[];
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

const truncateTranscript = (content: string, maxChars = 12000) => {
  if (content.length <= maxChars) {
    return content;
  }

  const head = content.slice(0, Math.floor(maxChars * 0.7));
  const tail = content.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[...]\n\n${tail}`;
};

export const suggestMetadata = async (title: string, content: string) => {
  const ai = getAiBinding();
  if (!ai) {
    throw new Error("AI binding not configured.");
  }

  const model = getAiModel();
  const prompt = `You are tagging The Magnus Archives transcripts.
Return JSON with keys: summary, fears, cast, themes, tags, locations.
- summary: 1-2 sentences.
- fears/themes/tags: short phrases, 3-10 items.
- cast/locations: proper names only if referenced.
Return JSON only.`;

  const input = truncateTranscript(content);
  const result = await ai.run(model, {
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Title: ${title}\n\nTranscript:\n${input}`
      }
    ]
  });

  const text = extractText(result);
  const parsed = extractJson(text);

  if (!parsed) {
    throw new Error("AI response could not be parsed.");
  }

  return parsed;
};
