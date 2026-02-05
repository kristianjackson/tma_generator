import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_INPUT = "./data/transcript_pdfs";
const DEFAULT_OUTPUT = "./data/ingest";
const DEFAULT_MODE = "insert";

const parseArgs = (argv) => {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    limit: null,
    mode: DEFAULT_MODE
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (value === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (value === "--limit" && argv[i + 1]) {
      const limit = Number.parseInt(argv[i + 1], 10);
      args.limit = Number.isNaN(limit) ? null : limit;
      i += 1;
    } else if (value === "--mode" && argv[i + 1]) {
      const mode = String(argv[i + 1]).toLowerCase();
      args.mode = mode === "update" ? "update" : "insert";
      i += 1;
    }
  }

  return args;
};

const parseFilename = (filename) => {
  const base = filename.replace(/\.pdf$/i, "");
  const episodeMatch = base.match(/MAG\s*0*(\d{1,3})/i);
  const episode = episodeMatch ? Number.parseInt(episodeMatch[1], 10) : null;
  let title = base;

  if (episodeMatch) {
    const afterEpisode = base.split(episodeMatch[0])[1] || "";
    title = afterEpisode.replace(/^\s*-\s*/, "");
  }

  title = title
    .replace(/\s+-\s*Transcript.*$/i, "")
    .replace(/\s+-\s*converted$/i, "")
    .replace(/\s+-\s*Re-formatted Template$/i, "")
    .trim();

  if (!title) {
    title = base;
  }

  const season =
    typeof episode === "number" && !Number.isNaN(episode)
      ? Math.ceil(episode / 40)
      : null;

  return { episode, season, title };
};

const normalizeText = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripInvisible = (value) =>
  value.replace(/[\u200B-\u200D\uFEFF]/g, "");

const stripInlineBrackets = (value) =>
  value.replace(/\[[^\]]*]/g, "");

const isBracketedLine = (line) =>
  /^\[[^\]]+\]$/.test(line.trim());

const isParentheticalLine = (line) => {
  const trimmed = line.trim();
  if (!/^\(.*\)$/.test(trimmed)) {
    return false;
  }
  return trimmed.length <= 120;
};

const normalizeLineForNoise = (line) =>
  line
    .replace(/\f/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const isNoiseLine = (line) => {
  const trimmed = line.trim();
  const normalized = normalizeLineForNoise(trimmed);

  if (!normalized) {
    return false;
  }

  if (/^\d{1,3}$/.test(normalized)) {
    return true;
  }

  if (/^Page\s+\d+(\s+of\s+\d+)?$/i.test(normalized)) {
    return true;
  }

  if (/^MAG\s*\d{1,3}(\s*[-–].*)?$/i.test(normalized)) {
    return true;
  }

  if (/^The Magnus Archives$/i.test(normalized)) {
    return true;
  }

  if (
    /^The Magnus Archives\s*[-–—]\s*MAG\s*\d{1,3}\s*[-–—].*/i.test(normalized)
  ) {
    return true;
  }

  if (
    /The Magnus Archives/i.test(normalized) &&
    /MAG\s*0*\d{1,3}/i.test(normalized)
  ) {
    return true;
  }

  if (/^MAG\s*[-–—]?\s*\d{1,3}\s*[-–—].*/i.test(normalized)) {
    return true;
  }

  if (/^Rusty Quill Presents/i.test(normalized)) {
    return true;
  }

  if (/^The Magnus Archives Episode/i.test(normalized)) {
    return true;
  }

  if (/^The Magnus Archives Theme/i.test(normalized)) {
    return true;
  }

  if (/rustyquill\.com/i.test(normalized)) {
    return true;
  }

  if (/Rusty Quill/i.test(normalized)) {
    return true;
  }

  if (/therustyquill/i.test(normalized)) {
    return true;
  }

  if (/rustyquilluk/i.test(normalized)) {
    return true;
  }

  if (/creative commons/i.test(normalized)) {
    return true;
  }

  if (/patreon/i.test(normalized)) {
    return true;
  }

  if (/Thanks for listening/i.test(normalized)) {
    return true;
  }

  if (/^The Magnus Archives is a podcast/i.test(normalized)) {
    return true;
  }

  if (/^To subscribe/i.test(normalized)) {
    return true;
  }

  if (/^Rate and review/i.test(normalized)) {
    return true;
  }

  if (/^Tweet us/i.test(normalized)) {
    return true;
  }

  if (/^Visit us on/i.test(normalized)) {
    return true;
  }

  if (/^Email us/i.test(normalized)) {
    return true;
  }

  if (/licensed under/i.test(normalized)) {
    return true;
  }

  if (/Transcript Re-formatted Template/i.test(normalized)) {
    return true;
  }

  if (/^converted$/i.test(normalized)) {
    return true;
  }

  if (isBracketedLine(normalized)) {
    return true;
  }

  if (isParentheticalLine(normalized)) {
    return true;
  }

  return false;
};

const extractWarningsFromLine = (line) => {
  const trimmed = line
    .replace(/^[-•–—\s]+/, "")
    .replace(/^\u2212\s*/, "")
    .trim();
  return trimmed;
};

const cleanTranscriptText = (rawText) => {
  const lines = rawText.split(/\r?\n/);
  const cleaned = [];
  const warnings = [];
  let inWarnings = false;
  let inOutro = false;

  for (const line of lines) {
    const sanitizedLine = stripInvisible(line).replace(/\f/g, "");
    const trimmed = sanitizedLine.trim();

    if (/Theme\s*[-–—]?\s*Outro/i.test(trimmed)) {
      inOutro = true;
      continue;
    }

    if (inOutro) {
      continue;
    }

    if (/^Content Warnings$/i.test(trimmed)) {
      inWarnings = true;
      continue;
    }

    if (inWarnings) {
      if (!trimmed) {
        inWarnings = false;
        continue;
      }

      if (
        /^The Magnus Archives Theme/i.test(trimmed) ||
        /^JONATHAN SIMS$/i.test(trimmed) ||
        /^Rusty Quill Presents/i.test(trimmed)
      ) {
        inWarnings = false;
        // fall through to normal handling for this line
      } else {
        const warning = extractWarningsFromLine(sanitizedLine);
        if (warning) {
          warnings.push(warning);
        }
        continue;
      }
    }

    const withoutBrackets = stripInlineBrackets(sanitizedLine);
    const cleanedLine = withoutBrackets.replace(/\s{2,}/g, " ").trimEnd();

    if (!cleanedLine.trim()) {
      continue;
    }

    if (isNoiseLine(cleanedLine)) {
      continue;
    }

    cleaned.push(cleanedLine);
  }

  return {
    text: normalizeText(cleaned.join("\n")),
    warnings: Array.from(new Set(warnings))
  };
};

const chunkTranscript = (content, chunkSize = 1200) => {
  const chunks = [];
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

  return chunks.filter((chunk) => {
    const wordCount = chunk.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 6) {
      return true;
    }

    return /statement/i.test(chunk);
  });
};

const sqlValue = (value) => {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? "NULL" : String(value);
  }

  const sanitized = String(value).replace(/\u0000/g, "").replace(/'/g, "''");
  return `'${sanitized}'`;
};

const buildInsert = (table, columns, values) =>
  `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values
    .map(sqlValue)
    .join(", ")});`;

const resolvePdfToText = async () => {
  const candidates = [
    process.env.PDFTOTEXT_PATH,
    "/usr/bin/pdftotext",
    "/usr/local/bin/pdftotext",
    "pdftotext"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      if (candidate === "pdftotext") {
        return candidate;
      }
    }
  }

  return "pdftotext";
};

const extractText = async (filePath) => {
  const pdfToText = await resolvePdfToText();

  try {
    const { stdout } = await execFileAsync(pdfToText, [
      "-layout",
      "-q",
      filePath,
      "-"
    ]);
    return stdout ?? "";
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        `pdftotext not found. Install poppler-utils (Ubuntu: sudo apt-get install poppler-utils, macOS: brew install poppler) or set PDFTOTEXT_PATH. Current PATH: ${process.env.PATH}`
      );
    }
    throw error;
  }
};

const main = async () => {
  const { input, output, limit, mode } = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(input);
  const outputDir = path.resolve(output);
  const files = (await fs.readdir(inputDir)).filter((file) =>
    file.toLowerCase().endsWith(".pdf")
  );
  const selectedFiles = limit ? files.slice(0, limit) : files;

  if (selectedFiles.length === 0) {
    console.log(`No PDF files found in ${inputDir}`);
    return;
  }

  const statements = [];
  const metadataLines = [];
  const createdAt = Date.now();

  for (const filename of selectedFiles) {
    const filePath = path.join(inputDir, filename);
    const rawText = await extractText(filePath);
    const { text, warnings } = cleanTranscriptText(rawText || "");

    if (!text) {
      console.warn(`Skipping ${filename}: no text extracted`);
      continue;
    }

    const { episode, season, title } = parseFilename(filename);
    const transcriptId = randomUUID();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (mode === "insert") {
      statements.push(
        buildInsert(
          "transcripts",
          [
            "id",
            "title",
            "season",
            "episode",
            "summary",
            "content",
            "source",
            "word_count",
            "created_at"
          ],
          [
            transcriptId,
            title,
            season,
            episode,
            null,
            text,
            filename,
            wordCount,
            createdAt
          ]
        )
      );

      statements.push(
        buildInsert(
          "transcript_metadata",
          [
            "transcript_id",
            "fears_json",
            "cast_json",
            "themes_json",
            "tags_json",
            "locations_json",
            "warnings_json"
          ],
          [
            transcriptId,
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify(warnings)
          ]
        )
      );
    } else {
      statements.push(
        `UPDATE transcripts SET content = ${sqlValue(
          text
        )}, word_count = ${sqlValue(wordCount)} WHERE source = ${sqlValue(
          filename
        )};`
      );
      statements.push(
        `UPDATE transcript_metadata SET warnings_json = ${sqlValue(
          JSON.stringify(warnings)
        )} WHERE transcript_id = (SELECT id FROM transcripts WHERE source = ${sqlValue(
          filename
        )});`
      );
      statements.push(
        `DELETE FROM transcript_chunks WHERE transcript_id = (SELECT id FROM transcripts WHERE source = ${sqlValue(
          filename
        )});`
      );
    }

    const chunks = chunkTranscript(text);
    chunks.forEach((chunk, index) => {
      if (mode === "insert") {
        statements.push(
          buildInsert(
            "transcript_chunks",
            [
              "id",
              "transcript_id",
              "chunk_index",
              "content",
              "keywords_json",
              "created_at"
            ],
            [
              randomUUID(),
              transcriptId,
              index,
              chunk,
              JSON.stringify([]),
              createdAt
            ]
          )
        );
      } else {
        statements.push(
          `INSERT INTO transcript_chunks (id, transcript_id, chunk_index, content, keywords_json, created_at)
           SELECT ${sqlValue(randomUUID())}, id, ${sqlValue(index)}, ${sqlValue(
            chunk
          )}, ${sqlValue(JSON.stringify([]))}, ${sqlValue(
            createdAt
          )} FROM transcripts WHERE source = ${sqlValue(filename)};`
        );
      }
    });

    metadataLines.push(
      JSON.stringify({
        id: transcriptId,
        filename,
        title,
        season,
        episode,
        wordCount,
        chunks: chunks.length,
        warnings,
        mode
      })
    );
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputName = mode === "update" ? "rechunk.sql" : "ingest.sql";
  let sql = statements.join("\n");

  await fs.writeFile(path.join(outputDir, outputName), `${sql}\n`, "utf8");
  await fs.writeFile(
    path.join(outputDir, "metadata.jsonl"),
    `${metadataLines.join("\n")}\n`,
    "utf8"
  );

  console.log(`Processed ${metadataLines.length} transcripts.`);
  console.log(`SQL written to ${path.join(outputDir, outputName)}`);
  console.log(`Metadata written to ${path.join(outputDir, "metadata.jsonl")}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
