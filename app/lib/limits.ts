const DEFAULT_DAILY_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

type LimitSource = "user" | "global" | "env";

export type RunLimitInfo = {
  limit: number;
  source: LimitSource;
  tier?: string | null;
};

export const parseDailyLimitValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed < 0 ? 0 : parsed;
};

export const getDefaultDailyLimit = () => {
  const parsed = parseDailyLimitValue(
    process.env.RUN_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT
  );
  return parsed ?? DEFAULT_DAILY_LIMIT;
};

export const getRunDailyLimit = async (userId?: string | null): Promise<RunLimitInfo> => {
  const envLimit = getDefaultDailyLimit();
  const { getDb } = await import("./db");
  const db = getDb();

  if (!db) {
    return { limit: envLimit, source: "env" };
  }
  try {
    if (userId) {
      const userRow = await db
        .prepare("SELECT daily_limit, tier FROM user_limits WHERE user_id = ?")
        .bind(userId)
        .first<{ daily_limit: number; tier?: string | null }>();
      const userLimit = parseDailyLimitValue(userRow?.daily_limit);

      if (userLimit !== null) {
        return {
          limit: userLimit,
          source: "user",
          tier: userRow?.tier ?? null
        };
      }
    }

    const globalRow = await db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .bind("run_daily_limit")
      .first<{ value?: string | null }>();
    const globalLimit = parseDailyLimitValue(globalRow?.value ?? null);

    if (globalLimit !== null) {
      return { limit: globalLimit, source: "global" };
    }
  } catch {
    return { limit: envLimit, source: "env" };
  }

  return { limit: envLimit, source: "env" };
};

export const formatDailyLimit = (limit: number) =>
  limit <= 0 ? "Unlimited" : String(limit);

export const getWindowStart = (now = Date.now()) => now - WINDOW_MS;

export const isLimitReached = (count: number, limit: number) =>
  limit > 0 && count >= limit;
