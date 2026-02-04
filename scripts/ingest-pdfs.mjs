import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_INPUT = "./data/transcript_pdfs";
const DEFAULT_OUTPUT = "./data/ingest";

const parseArgs = (argv) => {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, limit: null };

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
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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

  return chunks;
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

const ensurePdfPolyfills = async () => {
  if (globalThis.DOMMatrix) {
    return;
  }

  try {
    const canvas = await import("@napi-rs/canvas");
    if (canvas.DOMMatrix) {
      globalThis.DOMMatrix = canvas.DOMMatrix;
    }
    if (canvas.ImageData) {
      globalThis.ImageData = canvas.ImageData;
    }
    if (canvas.Path2D) {
      globalThis.Path2D = canvas.Path2D;
    }
  } catch {
    // Fall back to minimal stubs for text extraction (no rendering).
    class DOMMatrixStub {
      constructor() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
      multiplySelf() {
        return this;
      }
      translateSelf() {
        return this;
      }
      scaleSelf() {
        return this;
      }
      rotateSelf() {
        return this;
      }
      invertSelf() {
        return this;
      }
      transformPoint(point) {
        return point;
      }
    }

    globalThis.DOMMatrix = DOMMatrixStub;
    globalThis.DOMMatrixReadOnly = DOMMatrixStub;
    if (!globalThis.ImageData) {
      globalThis.ImageData = class ImageDataStub {};
    }
    if (!globalThis.Path2D) {
      globalThis.Path2D = class Path2DStub {};
    }
  }
};

const main = async () => {
  await ensurePdfPolyfills();
  const pdfParseModule = await import("pdf-parse");
  const pdfParse =
    "default" in pdfParseModule ? pdfParseModule.default : pdfParseModule;
  const { input, output, limit } = parseArgs(process.argv.slice(2));
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

  const statements = ["BEGIN TRANSACTION;"];
  const metadataLines = [];
  const createdAt = Date.now();

  for (const filename of selectedFiles) {
    const filePath = path.join(inputDir, filename);
    const buffer = await fs.readFile(filePath);
    const parsed = await pdfParse(buffer);
    const text = normalizeText(parsed.text || "");

    if (!text) {
      console.warn(`Skipping ${filename}: no text extracted`);
      continue;
    }

    const { episode, season, title } = parseFilename(filename);
    const transcriptId = randomUUID();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

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
          "locations_json"
        ],
        [
          transcriptId,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([])
        ]
      )
    );

    const chunks = chunkTranscript(text);
    chunks.forEach((chunk, index) => {
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
    });

    metadataLines.push(
      JSON.stringify({
        id: transcriptId,
        filename,
        title,
        season,
        episode,
        wordCount,
        chunks: chunks.length
      })
    );
  }

  statements.push("COMMIT;");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "ingest.sql"),
    `${statements.join("\n")}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputDir, "metadata.jsonl"),
    `${metadataLines.join("\n")}\n`,
    "utf8"
  );

  console.log(`Processed ${metadataLines.length} transcripts.`);
  console.log(`SQL written to ${path.join(outputDir, "ingest.sql")}`);
  console.log(`Metadata written to ${path.join(outputDir, "metadata.jsonl")}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
