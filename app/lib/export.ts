const sanitizeToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const buildFileBase = (value: string) => {
  const cleaned = sanitizeToken(value);
  return cleaned || "tma-story";
};

export const buildExportName = (
  base: string,
  ext: "txt" | "md",
  timestamp = new Date()
) => {
  const stamp = timestamp.toISOString().slice(0, 10);
  return `${buildFileBase(base)}-${stamp}.${ext}`;
};

