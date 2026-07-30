"use client";

import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../context/useApp";
import { fetchAdminHealth, fetchAdminIntegrity } from "../../api/admin";
import {
    GroupedList,
    KpiCard,
    KpiStrip,
    PageHeader,
    Pill,
} from "../../components/ui";
import { formatDateTime } from "../../utils/formatters";
import AdminSubNav from "./AdminSubNav";

const STALE_HOURS = {
    prices: 26, // hourly refresh timer
    backup: 48, // daily backup timer
};

function hoursSince(iso: string | null): number | null {
    if (!iso) return null;
    return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function freshnessTone(hours: number | null, staleAfter: number): string {
    if (hours == null) return "neutral";
    return hours > staleAfter ? "warning" : "positive";
}

export default function AdminSystemHealthView() {
    const { T, apiFetch } = useApp();

    const healthQuery = useQuery({
        queryKey: ["admin", "health"],
        queryFn: () => fetchAdminHealth(apiFetch),
    });
    const integrityQuery = useQuery({
        queryKey: ["admin", "health", "integrity"],
        queryFn: () => fetchAdminIntegrity(apiFetch),
    });

    const health = healthQuery.data;
    const priceHours = hoursSince(health?.prices.newest_update ?? null);
    const backupHours = hoursSince(health?.backup?.modified_at ?? null);
    const integrityIssues = Object.entries(integrityQuery.data ?? {});
    const hasViolations = integrityIssues.some(([, count]) => count > 0);

    return (
        <div>
            <PageHeader
                title={T("admin_health_title")}
                subtitle={T("admin_health_subtitle")}
            />
            <AdminSubNav />

            {healthQuery.isLoading ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>…</div>
            ) : (
                <KpiStrip columns={3}>
                    <KpiCard
                        label={T("admin_health_prices_label")}
                        value={
                            health?.prices.newest_update
                                ? formatDateTime(health.prices.newest_update)
                                : T("admin_health_no_data")
                        }
                        tone={freshnessTone(priceHours, STALE_HOURS.prices)}
                        compact
                    />
                    <KpiCard
                        label={T("admin_health_fx_label")}
                        value={
                            health?.fx.newest_date ?? T("admin_health_no_data")
                        }
                        tone="neutral"
                        compact
                    />
                    <KpiCard
                        label={T("admin_health_backup_label")}
                        value={
                            health?.backup
                                ? formatDateTime(health.backup.modified_at)
                                : T("admin_health_no_backup")
                        }
                        caption={health?.backup?.file}
                        tone={freshnessTone(backupHours, STALE_HOURS.backup)}
                        compact
                    />
                </KpiStrip>
            )}

            <GroupedList
                title={T("admin_integrity_title")}
                footer={
                    !integrityQuery.isLoading &&
                    !hasViolations &&
                    T("admin_integrity_all_clear")
                }
            >
                {integrityQuery.isLoading ? (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        …
                    </div>
                ) : (
                    integrityIssues
                        .filter(([, count]) => count > 0)
                        .map(([check, count]) => (
                            <GroupedList.Item
                                key={check}
                                label={check}
                                value={<Pill tone="danger">{count}</Pill>}
                            />
                        ))
                )}
            </GroupedList>
        </div>
    );
}
