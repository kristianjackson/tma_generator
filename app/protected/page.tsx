import { auth, clerkClient } from "@clerk/nextjs/server";

type ProtectedUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId?: string | null;
};

const getPrimaryEmail = (user: ProtectedUser) =>
  user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId
  )?.emailAddress ??
  user.emailAddresses[0]?.emailAddress ??
  "Unknown user";

const getDisplayName = (user: ProtectedUser) => {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  if (fullName) {
    return fullName;
  }

  return user.username ?? getPrimaryEmail(user);
};

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
