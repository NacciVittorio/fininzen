"use client";

import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../context/useApp";
import { fetchAdminOverview } from "../../api/admin";
import { KpiCard, KpiStrip, PageHeader } from "../../components/ui";
import AdminSubNav from "./AdminSubNav";

export default function AdminOverviewView() {
    const { T, apiFetch } = useApp();

    const overviewQuery = useQuery({
        queryKey: ["admin", "overview"],
        queryFn: () => fetchAdminOverview(apiFetch),
    });

    const data = overviewQuery.data;

    return (
        <div>
            <PageHeader
                title={T("tab_admin")}
                subtitle={T("admin_overview_subtitle")}
            />
            <AdminSubNav />

            {overviewQuery.isLoading ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>…</div>
            ) : (
                <KpiStrip columns={3}>
                    <KpiCard
                        label={T("admin_kpi_total_users")}
                        value={data?.total_users ?? 0}
                    />
                    <KpiCard
                        label={T("admin_kpi_pending")}
                        value={data?.pending_count ?? 0}
                        tone={data?.pending_count ? "warning" : "neutral"}
                    />
                    <KpiCard
                        label={T("admin_kpi_approved")}
                        value={data?.by_status.approved ?? 0}
                        tone="positive"
                    />
                    <KpiCard
                        label={T("admin_kpi_rejected")}
                        value={data?.by_status.rejected ?? 0}
                    />
                    <KpiCard
                        label={T("admin_kpi_admins")}
                        value={data?.by_role.admin ?? 0}
                        tone="accent"
                    />
                </KpiStrip>
            )}
        </div>
    );
}
