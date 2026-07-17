import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./tokens.css";
import "./styles.css";
import "./globals.css";
import { Providers } from "./providers";
import ErrorBoundary from "../components/ErrorBoundary";

// Variable-font mode: emette solo la CSS var --font-inter; l'opt-in al font
// avviene in tokens.css via --font-sans.
const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "fininzen",
    description: "Personal wealth management",
    icons: {
        icon: "/favicon.png",
        apple: [
            { url: "/icon-192.png" },
            { url: "/icon-512.png", sizes: "512x512" },
        ],
    },
    // `capable` emits `mobile-web-app-capable`, which is what Chrome/Android
    // read. iOS reads the `apple-` prefixed twin, which the Metadata API can no
    // longer emit — it is written by hand in the <head> below.
    //
    // `statusBarStyle` is repeated from that <head> on purpose: this object
    // always emits the meta tag, falling back to `default` when the field is
    // absent, which would contradict the <head> copy. Keep the two in sync.
    appleWebApp: {
        capable: true,
        title: "Fininzen",
        statusBarStyle: "black-translucent",
    },
    other: { "msapplication-TileColor": "#f7f7f5" },
};

export const viewport: Viewport = {
    themeColor: "#f7f7f5",
    viewportFit: "cover",
};

// iOS standalone splash screens. The Metadata API has no field for
// `apple-touch-startup-image`, so these <link> tags are written into the
// document head below. They only take effect once iOS considers the app
// standalone, i.e. together with the `apple-mobile-web-app-capable` meta tag
// rendered alongside them. The media queries match the device resolutions
// targeted by the legacy frontend.
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
        <html lang="it" className={inter.variable}>
            <head>
                {/* iOS latches the launch mode into the home-screen icon at
                    "Add to Home Screen" time and never recomputes it, reading
                    these three from the <head> of the parsed document. They are
                    written by hand rather than declared through the Metadata
                    API because the `await headers()` call above opts every
                    route into dynamic rendering, and Next then streams those tags
                    into the <body> (vercel/next.js#79313) — React only hoists
                    them into the <head> on hydration, far too late. On top of
                    that, `apple-mobile-web-app-capable` has no Metadata API
                    equivalent at all: `appleWebApp.capable` emits only the
                    `mobile-web-app-capable` twin (vercel/next.js#74524), which
                    iOS ignores. Without both of these the icon installs as a
                    Safari shortcut, with browser chrome and no splash screen.

                    The manifest link and the status bar style are emitted a
                    second time down in the <body> — the former by the
                    app/manifest.ts file convention, the latter by `appleWebApp`
                    above — and cannot be suppressed there. Both copies agree,
                    and only the first of a duplicated rel=manifest is used, so
                    the pair below is redundant rather than harmful. */}
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta
                    name="apple-mobile-web-app-status-bar-style"
                    content="black-translucent"
                />
                <link rel="manifest" href="/manifest.webmanifest" />
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
                <ErrorBoundary>
                    <Providers>{children}</Providers>
                </ErrorBoundary>
            </body>
        </html>
    );
}
