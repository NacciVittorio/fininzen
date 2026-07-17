"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { releaseNoteFor } from "../content/releaseNotes";
import { useApp } from "../context/useApp";
import { Icon } from "./ui";

// Mirrors UserProfile.last_seen_release. The server is the source of truth (so
// dismissing on one device dismisses everywhere), but the demo account can't
// PATCH its profile (IsNotDemoUser blocks writes) and neither can anyone while
// offline — localStorage keeps the banner from nagging them on every reload.
const SEEN_KEY = "lastSeenRelease";

export default function ReleaseNotesBar() {
    const { profile, updateProfile, T } = useApp();
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    const note = releaseNoteFor(version);

    // Starts hidden so the server render and the first client render agree; the
    // effect below decides once localStorage is readable.
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        try {
            setDismissed(localStorage.getItem(SEEN_KEY) === version);
        } catch {
            setDismissed(false);
        }
    }, [version]);

    const markSeen = useCallback(() => {
        setDismissed(true);
        try {
            localStorage.setItem(SEEN_KEY, version);
        } catch {
            // Best-effort cache; the profile PATCH below is the real record.
        }
        void updateProfile({ last_seen_release: version });
    }, [updateProfile, version]);

    // No entry for this version means a release with nothing to say to users
    // (a dependency bump, say) — stay quiet rather than announce an empty list.
    if (!note) return null;
    // profile.email is empty until the profile lands, and last_seen_release with
    // it — without this the banner would flash on every load before hydrating.
    if (!profile.email) return null;
    if (profile.last_seen_release === version) return null;
    if (dismissed) return null;

    const bar = (
        <div
            role="status"
            data-testid="release-notes-bar"
            className="release-bar"
            style={{
                position: "fixed",
                left: "50%",
                transform: "translateX(-50%)",
                // `bottom` lives in styles.css — it's breakpoint-dependent, and an
                // inline value would beat the media query.
                // Above the bottom nav (10), below the bulk toolbars (1080) and
                // toasts (1400) so an action in progress always wins.
                zIndex: 1060,
                width: "min(560px, calc(100vw - 32px))",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 12px 12px 16px",
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: 16,
                boxShadow: "var(--shadow-modal)",
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--fg)",
                    }}
                >
                    {T("release_bar_title").replace("{version}", version)}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                    {T("release_bar_body")}
                </div>
            </div>
            <Link
                href="/changelog"
                className="btn btn-sm"
                onClick={markSeen}
                style={{
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    color: "var(--accent-deep)",
                }}
            >
                {T("release_bar_view")}
            </Link>
            <button
                className="btn btn-g btn-sm"
                onClick={markSeen}
                data-testid="release-notes-dismiss"
                aria-label={T("release_bar_dismiss")}
                title={T("release_bar_dismiss")}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 8px",
                }}
            >
                <Icon name="x" size={16} aria-hidden="true" />
            </button>
        </div>
    );

    // Portal to the body: PullToRefresh transforms its wrapper, and Safari pins
    // position:fixed to the nearest transformed ancestor — the same reason
    // BottomSheet portals.
    return typeof document !== "undefined"
        ? createPortal(bar, document.body)
        : null;
}
