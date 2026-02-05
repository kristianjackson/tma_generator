export const getRunDisplayName = (title?: string | null, seed?: string | null) => {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const trimmedSeed = seed?.trim();
  if (trimmedSeed) {
    return trimmedSeed;
  }

  return "Untitled run";
};

