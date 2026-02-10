type CanonPolicyInput = {
  seed: string;
  notes?: string;
  includeCast?: boolean;
  cast?: string[];
  allowCanon?: boolean;
};

const CONTINUATION_PATTERN =
  /(continue|continuation|sequel|follow[- ]?up|same story|same episode|pick up where)/i;

export const allowsCanonCarryover = (input: CanonPolicyInput) => {
  if (input.allowCanon) {
    return true;
  }

  if (input.includeCast) {
    return true;
  }

  if ((input.cast ?? []).length > 0) {
    return true;
  }

  return CONTINUATION_PATTERN.test(`${input.seed}\n${input.notes ?? ""}`);
};

