const DEFAULT_DAILY_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export const getDailyLimit = () => {
  const raw = Number(process.env.RUN_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_DAILY_LIMIT;
  }
  return Math.floor(raw);
};

export const getWindowStart = (now = Date.now()) => now - WINDOW_MS;

export const isLimitReached = (count: number, limit: number) =>
  count >= limit;

