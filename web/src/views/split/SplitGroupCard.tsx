"use client";

import { useApp } from "../../context/useApp";
import { GroupedList } from "../../components/ui";
import type { SplitGroup } from "../../api/split";

// One row in SplitGroupListView. Thin wrapper around GroupedList.Item (same
// row chrome as every other grouped list in the app) rather than a bespoke
// card, since a group row needs nothing beyond icon/label/subtitle/chevron.
export default function SplitGroupCard({
    group,
    onSelect,
}: {
    group: SplitGroup;
    onSelect: () => void;
}) {
    const { T } = useApp();
    const memberCount = group.members.filter((m) => m.is_active).length;

    return (
        <GroupedList.Item
            icon={<span style={{ fontSize: 20 }}>{group.icon}</span>}
            label={group.name}
            subtitle={`${memberCount} ${T("split_members_label")}`}
            chevron
            onClick={onSelect}
            testId={`split-group-row-${group.id}`}
        />
    );
}
