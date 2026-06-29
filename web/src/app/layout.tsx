import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./tokens.css";
import "./styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
    title: "fininzen",
    description: "Personal wealth management",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: "/favicon.png",
        apple: [
            { url: "/icon-192.png" },
            { url: "/icon-512.png", sizes: "512x512" },
        ],
    },
    appleWebApp: {
        capable: true,
        title: "Fininzen",
        statusBarStyle: "black-translucent",
    },
    other: { "msapplication-TileColor": "#f4f8ff" },
};

export const viewport: Viewport = {
    themeColor: "#f4f8ff",
};

// iOS standalone splash screens. The Metadata API has no field for
// `apple-touch-startup-image`, so these <link> tags are rendered in the
// document head below; Next hoists them automatically. The media queries
// match the device resolutions targeted by the legacy frontend.
const SPLASH_SCREENS = [
    {
        href: "/splash/splash-750x1334.png",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
    },
    {
        href: "/splash/splash-1125x2436.png",
        media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
    },
    {
        href: "/splash/splash-1170x2532.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
    },
    {
        href: "/splash/splash-1179x2556.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
    },
    {
        href: "/splash/splash-1290x2796.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
    },
    {
        href: "/splash/splash-2048x2732.png",
        media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
    },
];

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
            <head>
                {SPLASH_SCREENS.map((s) => (
                    <link
                        key={s.href}
                        rel="apple-touch-startup-image"
                        media={s.media}
                        href={s.href}
                    />
                ))}
            </head>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
