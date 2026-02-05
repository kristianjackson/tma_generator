export type TierPreset = {
  id: "free" | "pro" | "superfan";
  label: string;
  limit: number;
};

export const TIER_PRESETS: TierPreset[] = [
  { id: "free", label: "Free", limit: 5 },
  { id: "pro", label: "Pro", limit: 25 },
  { id: "superfan", label: "Superfan", limit: 100 }
];

export const getTierPreset = (tierId?: string | null) =>
  TIER_PRESETS.find((tier) => tier.id === tierId) ?? null;

export const formatTierLabel = (tierId?: string | null) => {
  const preset = getTierPreset(tierId);
  return preset ? preset.label : "—";
};
