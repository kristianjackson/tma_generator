import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasAnyAdmin, isUserAdmin } from "./admin-utils";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const client = await clerkClient();
  const currentUser = await client.users.getUser(userId);
  const isAdmin = isUserAdmin(currentUser);

  if (!isAdmin) {
    const anyAdmin = await hasAnyAdmin(client);

    if (anyAdmin) {
      redirect("/dashboard");
    }
  }

  return children;
}
