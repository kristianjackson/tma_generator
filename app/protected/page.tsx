import { auth, clerkClient } from "@clerk/nextjs/server";
import { getDisplayName } from "../lib/user-utils";

export default async function ProtectedPage() {
  const { userId } = await auth();
  const client = await clerkClient();
  const user = userId ? await client.users.getUser(userId) : null;
  const displayName = user ? getDisplayName(user) : "Unknown user";

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Protected</p>
        <h1>Authenticated</h1>
        <p className="subhead">This data is rendered on the server.</p>
        <div className="card">
          <h2>User details</h2>
          <p className="subhead">Signed in as {displayName}</p>
        </div>
      </section>
    </main>
  );
}
