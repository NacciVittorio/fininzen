"use client";

import { useState } from "react";
import type { SplitGroup } from "../../api/split";
import { Card, ModalError } from "../../components/ui";
import Modal from "../../components/Modal";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import SplitActionRow from "./SplitActionRow";
import SplitGroupFormSheet from "./SplitGroupFormSheet";

export default function SplitGroupListView({
    createOpen,
    onCreateOpenChange,
}: {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
}) {
    const { T } = useApp();
    const {
        groups,
        groupsLoading,
        groupsError,
        loadSplitGroupDetail,
        removeSplitGroup,
    } = useSplit();
    const [localCreateOpen, setLocalCreateOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<SplitGroup | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SplitGroup | null>(null);
    const [deleting, setDeleting] = useState(false);
    const sheetOpen = Boolean(createOpen ?? localCreateOpen) || !!editingGroup;

    const setCreateOpen = (open: boolean) => {
        if (onCreateOpenChange) onCreateOpenChange(open);
        else setLocalCreateOpen(open);
        if (!open) setEditingGroup(null);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const removed = await removeSplitGroup(deleteTarget.id);
        setDeleting(false);
        if (removed) setDeleteTarget(null);
    };

    return (
        <section data-testid="split-groups-section">
            <div className="split-section-heading">
                <div className="grouped-list__title" style={{ padding: 0 }}>
                    {T("split_groups_title")}
                </div>
                <button
                    type="button"
                    className="btn btn-p btn-sm desktop-only"
                    data-testid="split-group-new-btn"
                    onClick={() => setCreateOpen(true)}
                >
                    + {T("split_group_new")}
                </button>
            </div>

            {groupsError && (
                <div style={{ marginBottom: 12 }}>
                    <ModalError>{groupsError}</ModalError>
                </div>
            )}

            {groupsLoading && groups.length === 0 ? (
                <Card className="split-empty-state">{T("loading")}</Card>
            ) : groups.length === 0 ? (
                <Card
                    className="split-empty-state"
                    data-testid="split-groups-empty"
                >
                    {T("split_groups_empty")}
                </Card>
            ) : (
                <div className="grouped-list">
                    {groups.map((group) => {
                        const memberCount = group.members.filter(
                            (member) => member.is_active,
                        ).length;
                        return (
                            <SplitActionRow
                                key={group.id}
                                rowId={`group-${group.id}`}
                                testId={`split-group-row-${group.id}`}
                                icon={
                                    <span style={{ fontSize: 20 }}>
                                        {group.icon}
                                    </span>
                                }
                                label={group.name}
                                subtitle={`${memberCount} ${T("split_members_label")}`}
                                chevron
                                onOpen={() => loadSplitGroupDetail(group.id)}
                                onEdit={() => setEditingGroup(group)}
                                onDelete={() => setDeleteTarget(group)}
                                editTestId={`split-group-edit-${group.id}`}
                                deleteTestId={`split-group-delete-${group.id}`}
                            />
                        );
                    })}
                </div>
            )}

            <SplitGroupFormSheet
                open={sheetOpen}
                group={editingGroup}
                onClose={() => setCreateOpen(false)}
            />

            {deleteTarget && (
                <Modal
                    title={T("modal_delete_group")}
                    onClose={() => setDeleteTarget(null)}
                >
                    <div className="split-confirm-content">
                        <div>{deleteTarget.name}</div>
                        <div className="split-confirm-hint">
                            {T("action_cannot_be_undone")}
                        </div>
                        <div className="split-confirm-actions">
                            <button
                                type="button"
                                className="btn btn-g"
                                onClick={() => setDeleteTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                data-testid="split-group-delete-confirm"
                                disabled={deleting}
                                onClick={confirmDelete}
                            >
                                {deleting ? "…" : T("btn_delete")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}
