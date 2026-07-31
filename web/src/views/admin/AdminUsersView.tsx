"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../context/useApp";
import {
    approveAdminUser,
    clearAdminUserWebauthn,
    disableAdminUserMfa,
    fetchAdminUsers,
    rejectAdminUser,
    setAdminUserActive,
    setAdminUserRole,
} from "../../api/admin";
import type {
    AdminUserRole,
    AdminUserRow,
    AdminUserStatus,
} from "../../api/admin";
import { GroupedList, PageHeader, Pill } from "../../components/ui";
import Select from "../../components/Select";
import Modal from "../../components/Modal";
import { formatDate, formatDateTime } from "../../utils/formatters";
import AdminSubNav from "./AdminSubNav";

const STATUS_TONE: Record<AdminUserStatus, string> = {
    pending: "warning",
    approved: "success",
    rejected: "danger",
};

const STATUS_FILTER_OPTIONS = [
    { value: "", label: "admin_filter_all" },
    { value: "pending", label: "admin_filter_pending" },
    { value: "approved", label: "admin_filter_approved" },
    { value: "rejected", label: "admin_filter_rejected" },
] as const;

const ROLE_OPTIONS: { value: AdminUserRole; label: string }[] = [
    { value: "user", label: "admin_role_user" },
    { value: "admin", label: "admin_role_admin" },
];

export default function AdminUsersView() {
    const { T, apiFetch, user: currentUserEmail } = useApp();
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<AdminUserStatus | "">("");
    const [rejectTarget, setRejectTarget] = useState<AdminUserRow | null>(null);
    const [deactivateTarget, setDeactivateTarget] =
        useState<AdminUserRow | null>(null);
    const [mfaResetTarget, setMfaResetTarget] = useState<AdminUserRow | null>(
        null,
    );
    const [webauthnResetTarget, setWebauthnResetTarget] =
        useState<AdminUserRow | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const usersQuery = useQuery({
        queryKey: ["admin", "users", statusFilter],
        queryFn: () => {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            return fetchAdminUsers(apiFetch, params);
        },
    });

    const invalidateAdmin = () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    };

    const approveMutation = useMutation({
        mutationFn: (id: number) => approveAdminUser(apiFetch, id),
        onSuccess: invalidateAdmin,
    });

    const rejectMutation = useMutation({
        mutationFn: (id: number) => rejectAdminUser(apiFetch, id),
        onSuccess: () => {
            invalidateAdmin();
            setRejectTarget(null);
        },
        onError: () => {
            setActionError(T("admin_action_error"));
            setRejectTarget(null);
        },
    });

    const setRoleMutation = useMutation({
        mutationFn: ({ id, role }: { id: number; role: AdminUserRole }) =>
            setAdminUserRole(apiFetch, id, role),
        onSuccess: invalidateAdmin,
        onError: () => setActionError(T("admin_action_error")),
    });

    const setActiveMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
            setAdminUserActive(apiFetch, id, isActive),
        onSuccess: () => {
            invalidateAdmin();
            setDeactivateTarget(null);
        },
        onError: () => {
            setActionError(T("admin_action_error"));
            setDeactivateTarget(null);
        },
    });

    const disableMfaMutation = useMutation({
        mutationFn: (id: number) => disableAdminUserMfa(apiFetch, id),
        onSuccess: () => {
            invalidateAdmin();
            setMfaResetTarget(null);
        },
        onError: () => {
            setActionError(T("admin_action_error"));
            setMfaResetTarget(null);
        },
    });

    const clearWebauthnMutation = useMutation({
        mutationFn: (id: number) => clearAdminUserWebauthn(apiFetch, id),
        onSuccess: () => {
            invalidateAdmin();
            setWebauthnResetTarget(null);
        },
        onError: () => {
            setActionError(T("admin_action_error"));
            setWebauthnResetTarget(null);
        },
    });

    const rows = usersQuery.data ?? [];

    return (
        <div>
            <PageHeader
                title={T("admin_users_title")}
                subtitle={T("admin_users_subtitle")}
            />
            <AdminSubNav />

            <div style={{ maxWidth: 220, marginBottom: 16 }}>
                <Select
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as AdminUserStatus | "")}
                    options={STATUS_FILTER_OPTIONS.map((opt) => ({
                        value: opt.value,
                        label: T(opt.label),
                    }))}
                />
            </div>

            {actionError && (
                <div
                    style={{
                        color: "var(--danger)",
                        fontSize: 12,
                        marginBottom: 12,
                    }}
                >
                    {actionError}
                </div>
            )}

            <GroupedList>
                {usersQuery.isLoading ? (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        …
                    </div>
                ) : rows.length ? (
                    rows.map((row) => (
                        <GroupedList.Item
                            key={row.user_id}
                            label={row.email}
                            subtitle={`${T("admin_joined_label")} ${formatDate(row.date_joined)} · ${T("admin_last_login")} ${row.last_login ? formatDateTime(row.last_login) : T("admin_never")} · ${T("admin_last_activity")} ${row.last_activity_at ? formatDateTime(row.last_activity_at) : T("admin_never")}`}
                            value={
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                    }}
                                >
                                    {!row.is_active && (
                                        <Pill tone="danger">
                                            {T("admin_status_disabled")}
                                        </Pill>
                                    )}
                                    <Pill tone={STATUS_TONE[row.status]}>
                                        {T(`admin_status_${row.status}`)}
                                    </Pill>
                                </div>
                            }
                            action={
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <div style={{ minWidth: 110 }}>
                                        <Select
                                            value={row.role}
                                            onChange={(role) =>
                                                setRoleMutation.mutate({
                                                    id: row.user_id,
                                                    role: role as AdminUserRole,
                                                })
                                            }
                                            options={ROLE_OPTIONS.map(
                                                (opt) => ({
                                                    value: opt.value,
                                                    label: T(opt.label),
                                                }),
                                            )}
                                            disabled={
                                                row.email ===
                                                    currentUserEmail &&
                                                row.role === "admin"
                                            }
                                        />
                                    </div>
                                    {row.status !== "approved" && (
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{
                                                fontSize: 11,
                                                padding: "4px 10px",
                                            }}
                                            disabled={approveMutation.isPending}
                                            onClick={() =>
                                                approveMutation.mutate(
                                                    row.user_id,
                                                )
                                            }
                                        >
                                            {T("admin_approve_button")}
                                        </button>
                                    )}
                                    {row.status !== "rejected" &&
                                        row.email !== currentUserEmail && (
                                            <button
                                                type="button"
                                                className="btn btn-r"
                                                style={{
                                                    fontSize: 11,
                                                    padding: "4px 10px",
                                                }}
                                                onClick={() =>
                                                    setRejectTarget(row)
                                                }
                                            >
                                                {T("admin_reject_button")}
                                            </button>
                                        )}
                                    {row.email !== currentUserEmail &&
                                        (row.is_active ? (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                style={{
                                                    fontSize: 11,
                                                    padding: "4px 10px",
                                                }}
                                                onClick={() =>
                                                    setDeactivateTarget(row)
                                                }
                                            >
                                                {T("admin_disable_button")}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                style={{
                                                    fontSize: 11,
                                                    padding: "4px 10px",
                                                }}
                                                disabled={
                                                    setActiveMutation.isPending
                                                }
                                                onClick={() =>
                                                    setActiveMutation.mutate({
                                                        id: row.user_id,
                                                        isActive: true,
                                                    })
                                                }
                                            >
                                                {T("admin_enable_button")}
                                            </button>
                                        ))}
                                    {row.email !== currentUserEmail &&
                                        row.mfa_enabled && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                style={{
                                                    fontSize: 11,
                                                    padding: "4px 10px",
                                                }}
                                                onClick={() =>
                                                    setMfaResetTarget(row)
                                                }
                                            >
                                                {T("admin_mfa_disable_button")}
                                            </button>
                                        )}
                                    {row.email !== currentUserEmail &&
                                        row.webauthn_credential_count > 0 && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                style={{
                                                    fontSize: 11,
                                                    padding: "4px 10px",
                                                }}
                                                onClick={() =>
                                                    setWebauthnResetTarget(row)
                                                }
                                            >
                                                {T(
                                                    "admin_webauthn_clear_button",
                                                )}
                                            </button>
                                        )}
                                </div>
                            }
                        />
                    ))
                ) : (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        {T("admin_no_users")}
                    </div>
                )}
            </GroupedList>

            {rejectTarget && (
                <Modal
                    title={T("admin_reject_confirm_title")}
                    onClose={() => setRejectTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("admin_reject_confirm_body").replace(
                                "{email}",
                                rejectTarget.email,
                            )}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setRejectTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                disabled={rejectMutation.isPending}
                                onClick={() =>
                                    rejectMutation.mutate(rejectTarget.user_id)
                                }
                            >
                                {T("admin_reject_button")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {deactivateTarget && (
                <Modal
                    title={T("admin_disable_confirm_title")}
                    onClose={() => setDeactivateTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("admin_disable_confirm_body").replace(
                                "{email}",
                                deactivateTarget.email,
                            )}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setDeactivateTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                disabled={setActiveMutation.isPending}
                                onClick={() =>
                                    setActiveMutation.mutate({
                                        id: deactivateTarget.user_id,
                                        isActive: false,
                                    })
                                }
                            >
                                {T("admin_disable_button")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {mfaResetTarget && (
                <Modal
                    title={T("admin_mfa_disable_confirm_title")}
                    onClose={() => setMfaResetTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("admin_mfa_disable_confirm_body").replace(
                                "{email}",
                                mfaResetTarget.email,
                            )}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setMfaResetTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                disabled={disableMfaMutation.isPending}
                                onClick={() =>
                                    disableMfaMutation.mutate(
                                        mfaResetTarget.user_id,
                                    )
                                }
                            >
                                {T("admin_mfa_disable_button")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {webauthnResetTarget && (
                <Modal
                    title={T("admin_webauthn_clear_confirm_title")}
                    onClose={() => setWebauthnResetTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("admin_webauthn_clear_confirm_body").replace(
                                "{email}",
                                webauthnResetTarget.email,
                            )}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setWebauthnResetTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                disabled={clearWebauthnMutation.isPending}
                                onClick={() =>
                                    clearWebauthnMutation.mutate(
                                        webauthnResetTarget.user_id,
                                    )
                                }
                            >
                                {T("admin_webauthn_clear_button")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
