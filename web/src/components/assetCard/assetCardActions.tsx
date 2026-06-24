"use client";

import { Icon } from "../ui";
import type { SwipeAction } from "../ui/SwipeRow";

type Asset = {
    id: number | string;
    is_archived?: boolean;
};

type BuildAssetSwipeActionsArgs = {
    asset: Asset;
    onArchive?: (asset: Asset) => void;
    onDelete?: (id: number | string) => void;
    onEdit?: (asset: Asset) => void;
    onUnarchive?: (id: number | string) => void;
    T: (key: string, fallback?: string) => string;
};

export function buildAssetSwipeActions({
    asset,
    onArchive,
    onDelete,
    onEdit,
    onUnarchive,
    T,
}: BuildAssetSwipeActionsArgs): SwipeAction[] {
    if (asset.is_archived) {
        return onUnarchive
            ? [
                  {
                      key: "unarchive",
                      label: T("btn_unarchive"),
                      icon: <Icon name="archive" size={15} />,
                      background: "var(--accent)",
                      onPress: () => onUnarchive(asset.id),
                      testId: `asset-swipe-unarchive-${asset.id}`,
                  },
              ]
            : [];
    }
    return [
        ...(onEdit
            ? [
                  {
                      key: "edit",
                      label: T("btn_edit", "Edit"),
                      icon: <Icon name="settings" size={15} />,
                      background: "var(--accent)",
                      onPress: () => onEdit(asset),
                      testId: `asset-swipe-edit-${asset.id}`,
                  },
              ]
            : []),
        ...(onDelete
            ? [
                  {
                      key: "delete",
                      label: T("btn_delete", "Delete"),
                      icon: <Icon name="trash" size={15} />,
                      background: "var(--danger)",
                      onPress: () => {
                          if (window.confirm(T("asset_delete_confirm")))
                              onDelete(asset.id);
                      },
                      testId: `asset-swipe-delete-${asset.id}`,
                  },
              ]
            : []),
        ...(onArchive
            ? [
                  {
                      key: "archive",
                      label: T("btn_archive"),
                      icon: <Icon name="archive" size={15} />,
                      background: "var(--warning)",
                      onPress: () => onArchive(asset),
                      testId: `asset-swipe-archive-${asset.id}`,
                  },
              ]
            : []),
    ];
}
