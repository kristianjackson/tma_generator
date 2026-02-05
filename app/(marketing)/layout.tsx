import type { Metadata } from "next";
import "./globals.css";
import Provider from "./Provider";

export const metadata: Metadata = {
  title: "TMA Generator",
  description: "Generate Magnus Archives-style stories with guided prompts.",
  icons: {
    icon: "/images/favicon.ico"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Provider>
      <div className="dark:bg-black">{children}</div>
    </Provider>
  );
}
