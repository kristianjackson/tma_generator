export type BasicUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId?: string | null;
  privateMetadata?: Record<string, unknown>;
};

export const getPrimaryEmail = (user: BasicUser) =>
  user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId
  )?.emailAddress ??
  user.emailAddresses[0]?.emailAddress ??
  "Unknown user";

export const getDisplayName = (user: BasicUser) => {
  const preferredName =
    typeof user.privateMetadata?.preferredName === "string"
      ? user.privateMetadata.preferredName.trim()
      : "";
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  if (preferredName) {
    return preferredName;
  }

  if (fullName) {
    return fullName;
  }

  return user.username ?? getPrimaryEmail(user);
};

export const isUserAdmin = (user: BasicUser) =>
  user.privateMetadata?.role === "admin" || user.privateMetadata?.isAdmin === true;
