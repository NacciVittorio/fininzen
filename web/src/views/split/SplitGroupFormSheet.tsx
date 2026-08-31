"use client";

import { useEffect, useState } from "react";
import type { SplitGroup } from "../../api/split";
import {
    BottomSheet,
    Label,
    ModalError,
    SheetTitle,
} from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";

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

export default function SplitGroupFormSheet({
    open,
    group,
    onClose,
    onSaved,
}: {
    open: boolean;
    group?: SplitGroup | null;
    onClose: () => void;
    onSaved?: () => void;
}) {
    const { T } = useApp();
    const { groupsError, addSplitGroup, editSplitGroup } = useSplit();
    const [name, setName] = useState("");
    const [icon, setIcon] = useState<string>(GROUP_ICON_CHOICES[0]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(group?.name ?? "");
        setIcon(group?.icon ?? GROUP_ICON_CHOICES[0]);
    }, [group, open]);

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        const saved = group
            ? await editSplitGroup(group.id, { name: trimmed, icon })
            : await addSplitGroup({ name: trimmed, icon });
        setSaving(false);
        if (saved) {
            onSaved?.();
            onClose();
        }
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            ariaLabel={group ? T("split_group_edit") : T("split_group_new")}
            header={
                <SheetTitle style={{ marginBottom: 0 }}>
                    {group ? T("split_group_edit") : T("split_group_new")}
                </SheetTitle>
            }
            footer={
                <div className="split-sheet-footer">
                    <button
                        type="button"
                        className="btn btn-g"
                        onClick={onClose}
                    >
                        {T("btn_cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-p"
                        data-testid={
                            group
                                ? `split-group-edit-save-${group.id}`
                                : "split-group-create-submit"
                        }
                        disabled={saving || !name.trim()}
                        onClick={handleSave}
                    >
                        {saving ? "…" : T("btn_save")}
                    </button>
                </div>
            }
        >
            <div className="split-sheet-form">
                {groupsError && <ModalError>{groupsError}</ModalError>}
                <div>
                    <Label>{T("split_group_icon_label")}</Label>
                    <div className="split-choice-grid" role="group">
                        {GROUP_ICON_CHOICES.map((choice) => (
                            <button
                                key={choice}
                                type="button"
                                className="split-icon-choice"
                                onClick={() => setIcon(choice)}
                                aria-pressed={icon === choice}
                                aria-label={`${T("split_group_icon_choice_label")} ${choice}`}
                            >
                                {choice}
                            </button>
                        ))}
                    </div>
                </div>
                <label>
                    <Label>{T("split_group_name_label")}</Label>
                    <input
                        className="inp"
                        style={{ width: "100%", minHeight: 44 }}
                        placeholder={T("split_group_name_placeholder")}
                        value={name}
                        data-testid="split-group-name-input"
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") handleSave();
                        }}
                    />
                </label>
            </div>
        </BottomSheet>
    );
}
