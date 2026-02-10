type CanonPolicyInput = {
  seed: string;
  notes?: string;
  includeCast?: boolean;
  include_cast?: boolean | string;
  cast?: string[];
  allowCanon?: boolean;
};

const CONTINUATION_PATTERN =
  /(continue|continuation|sequel|follow[- ]?up|same story|same episode|pick up where)/i;

export const allowsCanonCarryover = (input: CanonPolicyInput) => {
  if (input.allowCanon) {
    return true;
  }

  const includeCastValue =
    input.includeCast ??
    (typeof input.include_cast === "string"
      ? ["true", "yes", "1", "on"].includes(input.include_cast.toLowerCase())
      : input.include_cast);

  if (includeCastValue) {
    return true;
  }

  if ((input.cast ?? []).length > 0) {
    return true;
  }

  return CONTINUATION_PATTERN.test(`${input.seed}\n${input.notes ?? ""}`);
};
