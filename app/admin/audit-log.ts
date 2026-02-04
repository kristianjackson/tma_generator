import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AuditEntry = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string;
  targetName?: string;
  createdAt: number;
};

type KvNamespace = {
  put: (key: string, value: string) => Promise<void>;
  get: (key: string, type?: "json") => Promise<AuditEntry | null>;
  list: (options: { prefix: string; limit: number }) => Promise<{
    keys: { name: string }[];
  }>;
};

const getAuditBinding = () => {
  try {
    const context = getCloudflareContext();
    return (context?.env as { AUDIT_LOG?: KvNamespace } | undefined)?.AUDIT_LOG;
  } catch {
    return undefined;
  }
};

const makeKey = (entry: AuditEntry) => `audit:${entry.createdAt}:${entry.id}`;

export const appendAuditEntry = async (entry: AuditEntry) => {
  const kv = getAuditBinding();

  if (!kv) {
    return false;
  }

  await kv.put(makeKey(entry), JSON.stringify(entry));
  return true;
};

export const listAuditEntries = async (limit = 50) => {
  const kv = getAuditBinding();

  if (!kv) {
    return { entries: [] as AuditEntry[], configured: false };
  }

  const list = await kv.list({ prefix: "audit:", limit });
  const entries = await Promise.all(
    list.keys.map(async (key) => (await kv.get(key.name, "json")) ?? null)
  );

  return {
    entries: entries
      .filter((entry): entry is AuditEntry => Boolean(entry))
      .sort((a, b) => b.createdAt - a.createdAt),
    configured: true
  };
};
