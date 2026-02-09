const countMatches = (text: string, pattern: RegExp) =>
  (text.match(pattern) ?? []).length;

export const isNarrativeDraftOutput = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.length < 1200) {
    return false;
  }

  const outlineIntro =
    /(^|\n)\s*here is (a )?(numbered )?outline/i.test(trimmed) ||
    /(^|\n)\s*outline:/i.test(trimmed);
  if (outlineIntro) {
    return false;
  }

  const sectionMarkers = countMatches(
    trimmed,
    /(^|\n)\s*(\*{1,2}\s*)?(section|act|part)\s+\d+/gim
  );
  const listMarkers = countMatches(trimmed, /(^|\n)\s*(?:[-*]\s+|\d+\.\s+)/g);
  const scriptDialogueLines = countMatches(
    trimmed,
    /(^|\n)\s*[A-Z][A-Z\s'".-]{2,}:\s/g
  );
  const stageDirections = countMatches(trimmed, /(^|\n)\s*\[[^\]\n]{4,}\]/g);
  const paragraphCount = trimmed
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 60).length;

  if (sectionMarkers >= 2) {
    return false;
  }
  if (listMarkers >= 8) {
    return false;
  }
  if (scriptDialogueLines >= 6) {
    return false;
  }
  if (stageDirections >= 4) {
    return false;
  }
  if (paragraphCount < 5) {
    return false;
  }

  return true;
};

