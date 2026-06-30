import type { MetadataRoute } from "next";

// The manifest is fully static, so emit it as a static file. This is required
// for the mobile `output: export` build (which has no server to render a route
// handler on demand) and is a harmless no-op for the SSR web build.
export const dynamic = "force-static";

// PWA manifest, served at /manifest.webmanifest via Next's app-router
// convention. Ported verbatim from the legacy Vite frontend's public/
// manifest.json so the installable-app experience (standalone display,
// maskable icons, brand colors) carries over unchanged. The icon files live
// in web/public/ and serve at the root path.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Fininzen",
        short_name: "Fininzen",
        description: "Tracciamento spese e portafoglio investimenti personale",
        start_url: "/",
        display: "standalone",
        background_color: "#f4f8ff",
        theme_color: "#f4f8ff",
        orientation: "portrait-primary",
        // The legacy manifest declared each icon `purpose: "any maskable"`.
        // Next's typed Manifest only accepts a single purpose per entry, so we
        // list each icon twice (any + maskable) for the same runtime semantics.
        icons: [
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
