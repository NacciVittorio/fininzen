"use client";

import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../context/useApp";
import { fetchAdminRecordStats } from "../../api/admin";
import { GroupedList, PageHeader } from "../../components/ui";
import AdminSubNav from "./AdminSubNav";

export default function AdminRecordsView() {
    const { T, apiFetch } = useApp();

    const statsQuery = useQuery({
        queryKey: ["admin", "records"],
        queryFn: () => fetchAdminRecordStats(apiFetch),
    });

    const rows = Object.entries(statsQuery.data ?? {}).sort(
        (a, b) => b[1] - a[1],
    );

    return (
        <div>
            <PageHeader
                title={T("admin_records_title")}
                subtitle={T("admin_records_subtitle")}
            />
            <AdminSubNav />

            <GroupedList>
                {statsQuery.isLoading ? (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        …
                    </div>
                ) : (
                    rows.map(([label, count]) => {
                        const [app, model] = label.split(".");
                        return (
                            <GroupedList.Item
                                key={label}
                                label={model}
                                subtitle={app}
                                value={count.toLocaleString()}
                            />
                        );
                    })
                )}
            </GroupedList>
        </div>
    );
}
