"use client";

import Footer from "@/components/solid/Footer";
import Header from "@/components/solid/Header";
import Lines from "@/components/solid/Lines";
import ScrollToTop from "@/components/solid/ScrollToTop";
import { ThemeProvider } from "next-themes";
import ToasterContext from "./context/ToastContext";

export default function ClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ThemeProvider
            enableSystem={false}
            attribute="class"
            defaultTheme="light"
        >
            <Lines />
            <Header />
            <ToasterContext />
            {children}
            <Footer />
            <ScrollToTop />
        </ThemeProvider>
    );
}
