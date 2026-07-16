"use client";

import { useEffect, useState } from "react";

import { fetchHealth } from "../api/health";

// Next.js inlines the version at build time, so a frontend build that predates a
// release keeps showing the old number until it's rebuilt. The backend reads
// VERSION at runtime, so prefer the live value from /api/health/ and fall back
// to the build-time constant while it loads or when the backend is unreachable.
const BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** The current app version, live from the backend with a build-time fallback. */
export function useAppVersion(): string {
    const [version, setVersion] = useState(BUILD_VERSION);

    useEffect(() => {
        let active = true;
        fetchHealth()
            .then((health) => {
                if (active && health.version) setVersion(health.version);
            })
            .catch(() => {
                // Offline or backend down — keep the build-time fallback.
            });
        return () => {
            active = false;
        };
    }, []);

    return version;
}
