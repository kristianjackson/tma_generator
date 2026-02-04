import type { BasicUser } from "../lib/user-utils";
import { isUserAdmin } from "../lib/user-utils";

type AdminCheckUser = BasicUser & {
  id: string;
};

type UserListResponse<T> = {
  data: T[];
  totalCount?: number;
};

type ClerkClientLike = {
  users: {
    getUserList: (options: {
      limit: number;
      offset: number;
    }) => Promise<UserListResponse<AdminCheckUser> | AdminCheckUser[]>;
  };
};

const normalizeExcludeIds = (options: {
  excludeUserId?: string;
  excludeUserIds?: string[];
}) =>
  new Set([
    ...(options.excludeUserId ? [options.excludeUserId] : []),
    ...(options.excludeUserIds ?? [])
  ]);

export const hasAnyAdmin = async (
  client: ClerkClientLike,
  options: { excludeUserId?: string; excludeUserIds?: string[] } = {}
) => {
  const limit = 100;
  let offset = 0;
  const excludedIds = normalizeExcludeIds(options);

  while (true) {
    const response = await client.users.getUserList({ limit, offset });
    const users = Array.isArray(response) ? response : response.data;
    const totalCount = Array.isArray(response)
      ? users.length
      : response.totalCount ?? users.length;

    const hasAdmin = users.some(
      (user) => !excludedIds.has(user.id) && isUserAdmin(user)
    );

    if (hasAdmin) {
      return true;
    }

    offset += limit;

    if (users.length === 0 || offset >= totalCount) {
      return false;
    }
  }
};

export { isUserAdmin };
