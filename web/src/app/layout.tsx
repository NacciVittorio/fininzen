import type { Metadata } from "next";
import "./tokens.css";
import "./styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
    title: "fininzen",
    description: "Personal wealth management",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="it">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
