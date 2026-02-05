import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasAnyAdmin, isUserAdmin } from "./admin-utils";

type SessionClaims = {
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
};

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const claims = sessionClaims as SessionClaims | null;
  const isAdminClaim =
    claims?.publicMetadata?.role === "admin" ||
    claims?.privateMetadata?.role === "admin" ||
    claims?.publicMetadata?.isAdmin === true ||
    claims?.privateMetadata?.isAdmin === true;

  if (isAdminClaim) {
    return children;
  }

  try {
    const client = await clerkClient();
    const currentUser = await client.users.getUser(userId);
    const isAdmin = isUserAdmin(currentUser);

    if (!isAdmin) {
      const anyAdmin = await hasAnyAdmin(client);

      if (anyAdmin) {
        redirect("/dashboard");
      }
    }
  } catch {
    return children;
  }

  return children;
}
