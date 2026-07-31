"use client";

import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../context/useApp";
import { fetchAdminAuditLog } from "../../api/admin";
import { GroupedList, PageHeader } from "../../components/ui";
import { formatDateTime } from "../../utils/formatters";
import AdminSubNav from "./AdminSubNav";

const ACTION_LABEL_KEYS: Record<string, string> = {
    approve_user: "admin_audit_action_approve_user",
    reject_user: "admin_audit_action_reject_user",
    set_role: "admin_audit_action_set_role",
    set_active: "admin_audit_action_set_active",
    disable_mfa: "admin_audit_action_disable_mfa",
    clear_webauthn: "admin_audit_action_clear_webauthn",
};

function formatMetadata(metadata: Record<string, unknown>): string {
    return Object.entries(metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
}

export default function AdminAuditLogView() {
    const { T, apiFetch } = useApp();

    const logQuery = useQuery({
        queryKey: ["admin", "audit-log"],
        queryFn: () => fetchAdminAuditLog(apiFetch),
    });

    const rows = logQuery.data ?? [];

    return (
        <div>
            <PageHeader
                title={T("admin_audit_log_title")}
                subtitle={T("admin_audit_log_subtitle")}
            />
            <AdminSubNav />

            <GroupedList>
                {logQuery.isLoading ? (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        …
                    </div>
                ) : rows.length ? (
                    rows.map((entry) => {
                        const metadataText = formatMetadata(entry.metadata);
                        return (
                            <GroupedList.Item
                                key={entry.id}
                                label={T(
                                    ACTION_LABEL_KEYS[entry.action] ??
                                        entry.action,
                                )}
                                subtitle={`${entry.actor_email ?? "—"} → ${entry.target_email ?? "—"}${metadataText ? ` (${metadataText})` : ""}`}
                                value={formatDateTime(entry.created_at)}
                            />
                        );
                    })
                ) : (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        {T("admin_audit_log_no_entries")}
                    </div>
                )}
            </GroupedList>
        </div>
    );
}
