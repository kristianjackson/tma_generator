import { auth } from "@clerk/nextjs/server";

export default async function ProtectedPage() {
  const { userId } = await auth();

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Protected</p>
        <h1>Authenticated</h1>
        <p className="subhead">This data is rendered on the server.</p>
        <div className="card">
          <h2>User details</h2>
          <p className="subhead">User ID: {userId}</p>
        </div>
      </section>
    </main>
  );
}
