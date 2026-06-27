import type { Metadata } from "next";
import { headers } from "next/headers";
import "./tokens.css";
import "./styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
    title: "fininzen",
    description: "Personal wealth management",
};

export default async function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    // HIGH-23: reading the request headers opts every route into dynamic
    // rendering. That is required for the per-request CSP nonce minted in
    // middleware.ts to be stamped onto Next's framework <script> tags — under
    // static prerendering the nonce can't be injected and `'strict-dynamic'`
    // would block every script. The nonce itself is applied by Next from the
    // request CSP header; here we only need to force dynamic rendering.
    await headers();
    return (
        <html lang="it">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
