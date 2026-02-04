import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isUserAdmin } from "../lib/user-utils";

export default async function SiteNav() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <nav className="site-nav">
        <Link href="/">Home</Link>
      </nav>
    );
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const showAdmin = isUserAdmin(user);

  return (
    <nav className="site-nav">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/profile">Profile</Link>
      {showAdmin ? <Link href="/admin">Admin</Link> : null}
    </nav>
  );
}
