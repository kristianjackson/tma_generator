export type RunStatus =
  | "seeded"
  | "outline_pending"
  | "outlined"
  | "draft_pending"
  | "drafted"
  | "final";

export const formatRunStatus = (status: string) => {
  const map: Record<string, string> = {
    seeded: "Seeded",
    outline_pending: "Generating outline",
    outlined: "Outlined",
    draft_pending: "Generating draft",
    drafted: "Drafted",
    final: "Finalized"
  };

  return map[status] ?? status;
};

export const getContinueRoute = (runId: string, status: string) => {
  const routeMap: Record<string, string> = {
    seeded: `/generate/step-2?run=${runId}`,
    outline_pending: `/generate/step-2?run=${runId}`,
    outlined: `/generate/step-3?run=${runId}`,
    draft_pending: `/generate/step-3?run=${runId}`,
    drafted: `/generate/review?run=${runId}`,
    final: `/runs/${runId}`
  };

  return routeMap[status] ?? `/runs/${runId}`;
};
