import type { ApiFetcher } from "./client";
import { fetchAllPagesWithFetcher, requestJsonWithFetcher } from "./client";

export type AdminUserStatus = "pending" | "approved" | "rejected";
export type AdminUserRole = "user" | "admin";

export type AdminUserRow = {
    user_id: number;
    email: string;
    name: string;
    status: AdminUserStatus;
    role: AdminUserRole;
    approved_at: string | null;
    date_joined: string;
    is_active: boolean;
    last_login: string | null;
    last_activity_at: string | null;
};

export type AdminOverview = {
    total_users: number;
    by_status: Record<AdminUserStatus, number>;
    by_role: Record<AdminUserRole, number>;
    pending_count: number;
};

export type AdminRecordStats = Record<string, number>;

export type AdminAuditLogEntry = {
    id: number;
    actor_email: string | null;
    action: string;
    target_email: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
};

export type AdminHealth = {
    prices: {
        oldest_update: string | null;
        newest_update: string | null;
    };
    fx: {
        newest_date: string | null;
    };
    backup: {
        file: string;
        modified_at: string;
    } | null;
};

export type AdminIntegrityReport = Record<string, number>;

const withQuery = (path: string, params?: URLSearchParams): `/${string}` => {
    const query = params?.toString();
    return `${path}${query ? `?${query}` : ""}` as `/${string}`;
};

export const fetchAdminUsers = (
    fetcher: ApiFetcher,
    params?: URLSearchParams,
) =>
    fetchAllPagesWithFetcher<AdminUserRow>(
        fetcher,
        withQuery("/admin/users/", params),
    );

export const fetchAdminOverview = (fetcher: ApiFetcher) =>
    requestJsonWithFetcher<AdminOverview>(fetcher, "/admin/overview/");

export const approveAdminUser = (fetcher: ApiFetcher, id: number) =>
    requestJsonWithFetcher<AdminUserRow>(
        fetcher,
        `/admin/users/${id}/approve/`,
        {
            method: "POST",
        },
    );

export const rejectAdminUser = (fetcher: ApiFetcher, id: number) =>
    requestJsonWithFetcher<AdminUserRow>(
        fetcher,
        `/admin/users/${id}/reject/`,
        {
            method: "POST",
        },
    );

export const setAdminUserRole = (
    fetcher: ApiFetcher,
    id: number,
    role: AdminUserRole,
) =>
    requestJsonWithFetcher<AdminUserRow>(
        fetcher,
        `/admin/users/${id}/set_role/`,
        {
            method: "POST",
            body: { role },
        },
    );

export const setAdminUserActive = (
    fetcher: ApiFetcher,
    id: number,
    isActive: boolean,
) =>
    requestJsonWithFetcher<AdminUserRow>(
        fetcher,
        `/admin/users/${id}/set_active/`,
        {
            method: "POST",
            body: { is_active: isActive },
        },
    );

export const fetchAdminRecordStats = (fetcher: ApiFetcher) =>
    requestJsonWithFetcher<AdminRecordStats>(fetcher, "/admin/stats/records/");

export const fetchAdminAuditLog = (
    fetcher: ApiFetcher,
    params?: URLSearchParams,
) =>
    fetchAllPagesWithFetcher<AdminAuditLogEntry>(
        fetcher,
        withQuery("/admin/audit-log/", params),
    );

export const fetchAdminHealth = (fetcher: ApiFetcher) =>
    requestJsonWithFetcher<AdminHealth>(fetcher, "/admin/health/");

export const fetchAdminIntegrity = (fetcher: ApiFetcher) =>
    requestJsonWithFetcher<AdminIntegrityReport>(
        fetcher,
        "/admin/health/integrity/",
    );
