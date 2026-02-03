import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Sign In</p>
        <h1>Welcome back</h1>
        <p className="subhead">
          Clerk is running in keyless mode, so you can sign in immediately.
        </p>
        <div className="card auth-card">
          <SignIn />
        </div>
      </section>
    </main>
  );
}
