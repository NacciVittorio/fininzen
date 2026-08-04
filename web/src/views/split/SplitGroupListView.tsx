"use client";

import { useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card } from "../../components/ui";
import SplitGroupCard from "./SplitGroupCard";

const GROUP_ICON_CHOICES = [
    "👥",
    "🏠",
    "✈️",
    "🍽️",
    "🎉",
    "💼",
    "🚗",
    "🏖️",
] as const;

export default function SplitGroupListView() {
    const { T } = useApp();
    const {
        groups,
        groupsLoading,
        groupsError,
        addSplitGroup,
        loadSplitGroupDetail,
    } = useSplit();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [icon, setIcon] = useState<string>(GROUP_ICON_CHOICES[0]);
    const [saving, setSaving] = useState(false);

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        const created = await addSplitGroup({ name: trimmed, icon });
        setSaving(false);
        if (created) {
            setName("");
            setIcon(GROUP_ICON_CHOICES[0]);
            setCreating(false);
        }
    };

    return (
        <div>
            <div
                className="between"
                style={{ marginBottom: 10, alignItems: "center" }}
            >
                <div className="grouped-list__title" style={{ margin: 0 }}>
                    {T("split_groups_title")}
                </div>
                {!creating && (
                    <button
                        type="button"
                        className="btn btn-p btn-sm"
                        data-testid="split-group-new-btn"
                        onClick={() => setCreating(true)}
                    >
                        + {T("split_group_new")}
                    </button>
                )}
            </div>

            {creating && (
                <Card style={{ padding: 14, marginBottom: 14 }}>
                    <div
                        className="row"
                        style={{
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                        }}
                    >
                        <div
                            className="row"
                            style={{ gap: 6, flexWrap: "wrap" }}
                        >
                            {GROUP_ICON_CHOICES.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    onClick={() => setIcon(choice)}
                                    aria-pressed={icon === choice}
                                    aria-label={`${T("split_group_icon_choice_label")} ${choice}`}
                                    style={{
                                        fontSize: 18,
                                        width: 34,
                                        height: 34,
                                        borderRadius: 8,
                                        border:
                                            icon === choice
                                                ? "2px solid var(--accent)"
                                                : "1px solid var(--rule)",
                                        background: "var(--card-inset)",
                                        cursor: "pointer",
                                    }}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                        <input
                            className="inp"
                            style={{ flex: 1, minWidth: 160 }}
                            placeholder={T("split_group_name_placeholder")}
                            value={name}
                            data-testid="split-group-name-input"
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") handleCreate();
                            }}
                        />
                        <button
                            type="button"
                            className="btn btn-p btn-sm"
                            data-testid="split-group-create-submit"
                            disabled={saving || !name.trim()}
                            onClick={handleCreate}
                        >
                            {saving ? "…" : T("btn_add")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-g btn-sm"
                            onClick={() => setCreating(false)}
                        >
                            {T("btn_cancel")}
                        </button>
                    </div>
                </Card>
            )}

            {groupsError && (
                <div
                    style={{
                        color: "var(--danger)",
                        fontSize: 13,
                        marginBottom: 10,
                    }}
                >
                    {groupsError}
                </div>
            )}

            {groupsLoading && groups.length === 0 ? (
                <Card
                    style={{
                        padding: 20,
                        textAlign: "center",
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("loading")}
                </Card>
            ) : groups.length === 0 ? (
                <Card
                    style={{
                        padding: 20,
                        textAlign: "center",
                        color: "var(--fg-soft)",
                    }}
                    data-testid="split-groups-empty"
                >
                    {T("split_groups_empty")}
                </Card>
            ) : (
                <div className="grouped-list">
                    {groups.map((group) => (
                        <SplitGroupCard
                            key={group.id}
                            group={group}
                            onSelect={() => loadSplitGroupDetail(group.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
