import { useState } from "react";
import type { FormEvent } from "react";
import {
    createGrant,
    revokeGrant,
    updateGrantPermission,
} from "../../api/sharing";
import type { GrantPermission, ShareGrant } from "../../api/sharing";
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
            <form
                onSubmit={handleShare}
                style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 16,
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
                        setPermission(event.target.value as GrantPermission)
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
                        marginBottom: 10,
                    }}
                >
                    {error}
                </div>
            )}

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
        <>
            <div className="grouped-list__title">{T("share_given_title")}</div>
            <div className="grouped-list" style={{ marginBottom: 16 }}>
                {given.length ? (
                    given.map((grant) => (
                        <div
                            key={grant.id}
                            className="grouped-list__item"
                            style={{ alignItems: "center", gap: 12 }}
                        >
                            <span style={{ flex: 1, fontSize: 13 }}>
                                {grant.grantee_email}
                            </span>
                            <select
                                className="inp"
                                value={grant.permission}
                                onChange={(event) =>
                                    handlePermChange(
                                        grant.id,
                                        event.target.value as GrantPermission,
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
                                style={{ fontSize: 11, padding: "2px 10px" }}
                            >
                                {T("revoke_access")}
                            </button>
                        </div>
                    ))
                ) : (
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 12,
                        }}
                    >
                        {T("no_grants_given")}
                    </div>
                )}
            </div>
        </>
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
        <>
            <div className="grouped-list__title">
                {T("share_received_title")}
            </div>
            <div className="grouped-list">
                {received.length ? (
                    received.map((grant) => (
                        <div
                            key={grant.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 8,
                                padding: "8px 10px",
                                background: "var(--rule-soft)",
                                borderRadius: 8,
                            }}
                        >
                            <span style={{ flex: 1, fontSize: 13 }}>
                                {grant.owner_email}
                            </span>
                            <span
                                style={{
                                    fontSize: 11,
                                    color: "var(--fg-soft)",
                                    padding: "2px 8px",
                                    background: "var(--card-inset)",
                                    borderRadius: 6,
                                }}
                            >
                                {grant.permission === "read"
                                    ? T("permission_read")
                                    : grant.permission === "write"
                                      ? T("permission_write")
                                      : T("permission_full")}
                            </span>
                        </div>
                    ))
                ) : (
                    <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                        {T("no_grants_received")}
                    </div>
                )}
            </div>
        </>
    );
}
