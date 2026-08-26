"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon, Popover, SwipeRow, type SwipeAction } from "../../components/ui";
import { useApp } from "../../context/useApp";

type SplitActionRowProps = {
    rowId: string | number;
    testId: string;
    icon?: ReactNode;
    label: ReactNode;
    subtitle?: ReactNode;
    value?: ReactNode;
    chevron?: boolean;
    onOpen?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    editTestId?: string;
    deleteTestId?: string;
    extraActions?: Array<{
        key: string;
        label: ReactNode;
        icon?: ReactNode;
        onPress: () => void;
        testId?: string;
    }>;
};

export default function SplitActionRow({
    rowId,
    testId,
    icon,
    label,
    subtitle,
    value,
    chevron,
    onOpen,
    onEdit,
    onDelete,
    editTestId,
    deleteTestId,
    extraActions = [],
}: SplitActionRowProps) {
    const { T } = useApp();
    const [openRowId, setOpenRowId] = useState<string | number | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLButtonElement>(null);
    const actions: SwipeAction[] = [];

    for (const action of extraActions) {
        actions.push({
            key: action.key,
            label: action.label,
            icon: action.icon,
            background: "var(--accent-deep)",
            testId: action.testId,
            onPress: action.onPress,
        });
    }

    if (onEdit) {
        actions.push({
            key: "edit",
            label: T("btn_edit"),
            icon: <Icon name="edit" size={17} />,
            background: "var(--accent)",
            testId: editTestId,
            onPress: onEdit,
        });
    }
    if (onDelete) {
        actions.push({
            key: "delete",
            label: T("btn_delete"),
            icon: <Icon name="trash" size={17} />,
            background: "var(--danger)",
            testId: deleteTestId,
            onPress: onDelete,
        });
    }

    return (
        <SwipeRow
            rowId={rowId}
            testId={testId}
            openRowId={openRowId}
            onRequestOpen={setOpenRowId}
            actions={actions}
            onTap={onOpen ?? onEdit}
            rowClassName="grouped-list__item"
            ariaLabel={typeof label === "string" ? label : undefined}
        >
            <span className="split-action-row__leading">
                {icon && <span className="split-action-row__icon">{icon}</span>}
                <span className="split-action-row__copy">
                    <span className="split-action-row__label">{label}</span>
                    {subtitle && (
                        <span className="split-action-row__subtitle">
                            {subtitle}
                        </span>
                    )}
                </span>
            </span>
            {value != null && (
                <span className="split-action-row__value">{value}</span>
            )}
            {(extraActions.length > 0 || onEdit || onDelete) && (
                <>
                    <button
                        ref={menuRef}
                        type="button"
                        className="split-row-menu-trigger desktop-only"
                        data-testid={`${testId}-menu`}
                        aria-label={T("split_actions_label")}
                        onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpen((current) => !current);
                        }}
                    >
                        <Icon name="moreVertical" size={19} />
                    </button>
                    <Popover
                        open={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        anchorRef={menuRef}
                        align="end"
                        minWidth={170}
                    >
                        <div className="split-row-menu">
                            {extraActions.map((action) => (
                                <button
                                    key={action.key}
                                    type="button"
                                    data-testid={action.testId}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        action.onPress();
                                    }}
                                >
                                    {action.icon}
                                    {action.label}
                                </button>
                            ))}
                            {onEdit && (
                                <button
                                    type="button"
                                    data-testid={editTestId}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onEdit();
                                    }}
                                >
                                    <Icon name="edit" size={17} />
                                    {T("btn_edit")}
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    type="button"
                                    className="danger"
                                    data-testid={deleteTestId}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onDelete();
                                    }}
                                >
                                    <Icon name="trash" size={17} />
                                    {T("btn_delete")}
                                </button>
                            )}
                        </div>
                    </Popover>
                </>
            )}
            {chevron && <span className="split-action-row__chevron">›</span>}
        </SwipeRow>
    );
}
