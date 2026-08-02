"use client";

import Link from "next/link";

import { GroupedList } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import { useAppVersion } from "../../hooks/useAppVersion";
import { formatDate } from "../../utils/formatters";

export function AboutSettingsSection() {
    const { T } = useAuth();
    // Live from the backend (read from VERSION at runtime) so it stays correct
    // even if the frontend build inlined an older version; falls back to the
    // build-time constant while it loads or offline.
    const appVersion = useAppVersion();
    // Empty on a checkout with no matching CHANGELOG section — omit the row then.
    const releaseDate = process.env.NEXT_PUBLIC_RELEASE_DATE ?? "";

    return (
        <div>
            <div className="grouped-list__title">{T("about_title")}</div>
            <GroupedList>
                <GroupedList.Item
                    label={T("about_version")}
                    value={
                        <span
                            className="mono"
                            style={{ fontSize: 14, fontWeight: 600 }}
                        >
                            {appVersion}
                        </span>
                    }
                />
                {releaseDate && (
                    <GroupedList.Item
                        label={T("about_released_on")}
                        value={
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                {formatDate(releaseDate)}
                            </span>
                        }
                    />
                )}
                <Link
                    href="/changelog"
                    className="grouped-list__item pressable"
                    style={{ color: "var(--accent)" }}
                >
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {T("about_whats_new")}
                    </span>
                    <span
                        aria-hidden="true"
                        style={{
                            color: "var(--fg-faint)",
                            fontSize: 17,
                            lineHeight: 1,
                        }}
                    >
                        ›
                    </span>
                </Link>
            </GroupedList>
        </div>
    );
}
