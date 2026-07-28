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
};

export type AdminOverview = {
    total_users: number;
    by_status: Record<AdminUserStatus, number>;
    by_role: Record<AdminUserRole, number>;
    pending_count: number;
};

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
