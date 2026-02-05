import "../(app)/css/globals.css";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="min-h-screen bg-lightgray dark:bg-dark">{children}</div>
    </ThemeProvider>
  );
}
