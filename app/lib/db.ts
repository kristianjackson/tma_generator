import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1Database = {
  prepare: (query: string) => {
    bind: (...params: unknown[]) => {
      all: <T>() => Promise<{ results: T[] }>;
      first: <T>() => Promise<T | null>;
      run: () => Promise<void>;
    };
  };
};

export const getDb = () => {
  try {
    const context = getCloudflareContext();
    return (context?.env as { DB?: D1Database } | undefined)?.DB;
  } catch {
    return undefined;
  }
};

export const requireDb = () => {
  const db = getDb();
  if (!db) {
    throw new Error("D1 database binding (DB) is not configured.");
  }
  return db;
};
