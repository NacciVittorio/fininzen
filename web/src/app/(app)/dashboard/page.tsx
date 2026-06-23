"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUserProfile } from "../../../api/profile";
import { useApiFetch } from "../../../context/useAuthenticatedFetch";
import { useI18n } from "../../../context/I18nProvider";

export default function DashboardPage() {
    const apiFetch = useApiFetch();
    const { T } = useI18n();
    const { data, isPending, isError } = useQuery({
        queryKey: ["profile"],
        queryFn: () => fetchUserProfile(apiFetch),
    });

    return (
        <div style={{ padding: "24px 16px" }}>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>
                {T("tab_dashboard")}
            </h1>
            {isPending && <p style={{ color: "var(--fg-soft)" }}>Loading…</p>}
            {isError && (
                <p style={{ color: "var(--danger)" }}>
                    Failed to load profile.
                </p>
            )}
            {data && (
                <p style={{ color: "var(--fg-soft)" }}>
                    Signed in as <strong>{data.email ?? data.name}</strong>.
                </p>
            )}
        </div>
    );
}
