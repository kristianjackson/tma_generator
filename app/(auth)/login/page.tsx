import { SignIn, SignedIn, SignedOut, SignOutButton } from "@clerk/nextjs";
import Link from "next/link";

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
          <SignedOut>
            <SignIn
              routing="path"
              path="/login"
              afterSignInUrl="/dashboard"
              afterSignUpUrl="/dashboard"
            />
          </SignedOut>
          <SignedIn>
            <p className="subhead">You're already signed in.</p>
            <div className="actions">
              <Link className="primary link-button" href="/dashboard">
                Go to dashboard
              </Link>
              <SignOutButton redirectUrl="/login">
                <button className="ghost" type="button">
                  Switch account
                </button>
              </SignOutButton>
            </div>
          </SignedIn>
        </div>
      </section>
    </main>
  );
}
