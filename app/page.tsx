import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Cloudflare Pages • Clerk Ready</p>
        <h1>TMA Generator</h1>
        <p className="subhead">
          This is the initial landing page. We will expand it with your
          multi-user workflow once auth is live.
        </p>
        <div className="actions">
          <Link className="primary link-button" href="/login">
            Get Started
          </Link>
          <Link className="ghost link-button" href="/dashboard">
            View Dashboard
          </Link>
          <Link className="ghost link-button" href="/protected">
            Protected Page
          </Link>
        </div>
        <div className="card">
          <h2>What’s Next</h2>
          <ul>
            <li>Confirm sign-in experience (email, social, or both)</li>
            <li>Add protected dashboard routes</li>
            <li>Persist user data with Workers + D1</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
