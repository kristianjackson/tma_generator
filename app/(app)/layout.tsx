import "./css/globals.css";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import DashboardShell from "./DashboardShell";

export default function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DashboardShell>{children}</DashboardShell>
    </ThemeProvider>
  );
}
