"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
    createGrant,
    revokeGrant,
    updateGrantPermission,
} from "../../api/sharing";
import type { GrantPermission, ShareGrant } from "../../api/sharing";
import { Card, GroupedList } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import type { Translator } from "../../types";

export function SharingSection({ T }: { T: Translator }) {
    const { grants, fetchGrants, apiFetch } = useAuth();
    const [email, setEmail] = useState("");
    const [permission, setPermission] = useState<GrantPermission>("read");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const given = grants?.given ?? [];
    const received = grants?.received ?? [];

    const handleShare = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await createGrant(apiFetch, { email, permission });
            setEmail("");
            fetchGrants();
        } catch (err) {
            const data =
                (err as { payload?: { error?: string } })?.payload || {};
            setError(
                data.error === "user_not_found"
                    ? T("user_not_found")
                    : data.error || "Error",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleRevoke = async (id: number | string) => {
        await revokeGrant(apiFetch, id);
        fetchGrants();
    };

    const handlePermChange = async (
        id: number | string,
        newPerm: GrantPermission,
    ) => {
        await updateGrantPermission(apiFetch, id, { permission: newPerm });
        fetchGrants();
    };

    return (
        <div>
            <Card variant="settings" style={{ marginBottom: 20 }}>
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                    }}
                >
                    {T("share_with")}
                </div>
                <form
                    onSubmit={handleShare}
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <input
                        className="inp"
                        type="email"
                        placeholder={T("share_with_placeholder")}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        style={{ flex: 1, minWidth: 180 }}
                    />
                    <select
                        className="inp"
                        value={permission}
                        onChange={(event) =>
                            setPermission(
                                event.target.value as GrantPermission,
                            )
                        }
                        style={{ minWidth: 140 }}
                    >
                        <option value="read">{T("permission_read")}</option>
                        <option value="write">{T("permission_write")}</option>
                        <option value="full">{T("permission_full")}</option>
                    </select>
                    <button
                        type="submit"
                        className="btn"
                        disabled={saving}
                        style={{ whiteSpace: "nowrap", padding: "8px 16px" }}
                    >
                        {T("share_btn")}
                    </button>
                </form>
                {error && (
                    <div
                        style={{
                            color: "var(--danger)",
                            fontSize: 12,
                            marginTop: 10,
                        }}
                    >
                        {error}
                    </div>
                )}
            </Card>

            <SharingGivenList
                T={T}
                given={given}
                handlePermChange={handlePermChange}
                handleRevoke={handleRevoke}
            />
            <SharingReceivedList T={T} received={received} />
        </div>
    );
}

function SharingGivenList({
    T,
    given,
    handlePermChange,
    handleRevoke,
}: {
    T: Translator;
    given: ShareGrant[];
    handlePermChange: (id: number | string, newPerm: GrantPermission) => void;
    handleRevoke: (id: number | string) => void;
}) {
    return (
        <GroupedList title={T("sharing_given_title")}>
            {given.length ? (
                given.map((grant) => (
                    <GroupedList.Item
                        key={grant.id}
                        label={grant.grantee_email}
                        action={
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <select
                                    className="inp"
                                    value={grant.permission}
                                    onChange={(event) =>
                                        handlePermChange(
                                            grant.id,
                                            event.target
                                                .value as GrantPermission,
                                        )
                                    }
                                    style={{
                                        fontSize: 11,
                                        padding: "2px 6px",
                                        minWidth: 110,
                                    }}
                                >
                                    <option value="read">
                                        {T("permission_read")}
                                    </option>
                                    <option value="write">
                                        {T("permission_write")}
                                    </option>
                                    <option value="full">
                                        {T("permission_full")}
                                    </option>
                                </select>
                                <button
                                    onClick={() => handleRevoke(grant.id)}
                                    className="btn btn-r"
                                    style={{
                                        fontSize: 11,
                                        padding: "2px 10px",
                                    }}
                                >
                                    {T("revoke_access")}
                                </button>
                            </div>
                        }
                    />
                ))
            ) : (
                <div
                    style={{
                        padding: "14px 16px",
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("no_grants_given")}
                </div>
            )}
        </GroupedList>
    );
}

function SharingReceivedList({
    T,
    received,
}: {
    T: Translator;
    received: ShareGrant[];
}) {
    return (
        <GroupedList title={T("sharing_received_title")}>
            {received.length ? (
                received.map((grant) => (
                    <GroupedList.Item
                        key={grant.id}
                        label={grant.owner_email}
                        value={
                            grant.permission === "read"
                                ? T("permission_read")
                                : grant.permission === "write"
                                  ? T("permission_write")
                                  : T("permission_full")
                        }
                    />
                ))
            ) : (
                <div
                    style={{
                        padding: "14px 16px",
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("no_grants_received")}
                </div>
            )}
        </GroupedList>
    );
}
