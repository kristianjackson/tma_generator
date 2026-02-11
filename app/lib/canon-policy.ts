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

const parseBooleanish = (value: unknown) => {
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

export const isContinuationRequest = (input: Pick<CanonPolicyInput, "seed" | "notes">) => {
  return CONTINUATION_PATTERN.test(`${input.seed}\n${input.notes ?? ""}`);
};

export const allowsCanonCarryover = (input: CanonPolicyInput) => {
  if (input.allowCanon) {
    return true;
  }

  return isContinuationRequest(input);
};

export const allowsCastCarryover = (input: CanonPolicyInput) => {
  const includeCastValue = parseBooleanish(
    input.includeCast ?? input.include_cast
  );

  if (includeCastValue) {
    return true;
  }

  if ((input.cast ?? []).length > 0) {
    return true;
  }

  return false;
};
