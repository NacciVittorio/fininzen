"use client";

import { useEffect, useState } from "react";
import type { SplitContact } from "../../api/split";
import { BottomSheet, Label, SheetTitle } from "../../components/ui";
import Select from "../../components/Select";
import { useApp } from "../../context/useApp";

export default function SplitMemberFormSheet({
    open,
    candidates,
    saving,
    onSave,
    onClose,
}: {
    open: boolean;
    candidates: SplitContact[];
    saving: boolean;
    onSave: (contact: SplitContact) => void;
    onClose: () => void;
}) {
    const { T } = useApp();
    const [value, setValue] = useState("");

    useEffect(() => {
        if (open) setValue("");
    }, [open]);

    const selected = candidates.find(
        (candidate) => String(candidate.id) === value,
    );

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            ariaLabel={T("modal_add_member")}
            header={
                <SheetTitle style={{ marginBottom: 0 }}>
                    {T("modal_add_member")}
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
                        data-testid="split-add-member-confirm"
                        disabled={saving || !selected}
                        onClick={() => selected && onSave(selected)}
                    >
                        {saving ? "…" : T("btn_add")}
                    </button>
                </div>
            }
        >
            <div className="split-sheet-form">
                <div>
                    <Label>{T("split_group_members_title")}</Label>
                    <Select
                        value={value}
                        data-testid="split-add-member-select"
                        onChange={setValue}
                        options={candidates.map((candidate) => ({
                            value: String(candidate.id),
                            label: candidate.display_name,
                        }))}
                        placeholder={T("split_add_member_placeholder")}
                    />
                </div>
                {candidates.length === 0 && (
                    <div className="split-confirm-hint">
                        {T("split_no_member_candidates")}
                    </div>
                )}
            </div>
        </BottomSheet>
    );
}
