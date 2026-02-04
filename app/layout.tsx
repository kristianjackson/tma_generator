import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton
} from "@clerk/nextjs";
import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TMA Generator",
  description: "A Cloudflare-hosted app with Clerk authentication."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={spaceGrotesk.className}>
          <header className="site-header">
            <div className="brand">
              <SignedIn>
                <Link className="brand-link" href="/dashboard">
                  TMA Generator
                </Link>
              </SignedIn>
              <SignedOut>
                <Link className="brand-link" href="/">
                  TMA Generator
                </Link>
              </SignedOut>
            </div>
            <div className="auth">
              <SignedOut>
                <SignInButton />
                <SignUpButton />
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
