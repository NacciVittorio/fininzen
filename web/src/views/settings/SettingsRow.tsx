"use client";

import type { CSSProperties, ReactNode } from "react";

// Shared primitives for Settings pages, replacing the hand-duplicated
// `<div className="card" style={{padding:16, fontSize:15...}}>` blocks that
// used to be copy-pasted across every settings section.

export function SettingsCard({
    title,
    description,
    danger,
    children,
}: {
    title?: ReactNode;
    description?: ReactNode;
    danger?: boolean;
    children?: ReactNode;
}) {
    const cardStyle: CSSProperties = {
        padding: 16,
        ...(danger ? { borderColor: "var(--danger-soft)" } : null),
    };
    return (
        <div className="card" style={cardStyle}>
            {title && (
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 600,
                        marginBottom: description ? 4 : 10,
                        color: danger ? "var(--danger)" : undefined,
                    }}
                >
                    {title}
                </div>
            )}
            {description && (
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 14,
                        lineHeight: 1.35,
                    }}
                >
                    {description}
                </div>
            )}
            {children}
        </div>
    );
}

export function SettingsGroup({
    title,
    danger,
    children,
    style,
}: {
    title?: ReactNode;
    danger?: boolean;
    children?: ReactNode;
    style?: CSSProperties;
}) {
    return (
        <div style={{ marginBottom: 20, ...style }}>
            {title && (
                <div
                    className="grouped-list__title"
                    style={danger ? { color: "var(--danger)" } : undefined}
                >
                    {title}
                </div>
            )}
            <div
                className="grouped-list"
                style={
                    danger
                        ? { boxShadow: "inset 0 0 0 1px var(--danger-ring)" }
                        : undefined
                }
            >
                {children}
            </div>
        </div>
    );
}

export function SettingsRow({
    label,
    description,
    trailing,
    onClick,
    danger,
    testId,
}: {
    label: ReactNode;
    description?: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    danger?: boolean;
    testId?: string;
}) {
    const content = (
        <>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: danger ? "var(--danger)" : "var(--fg)",
                    }}
                >
                    {label}
                </div>
                {description && (
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginTop: 2,
                            lineHeight: 1.35,
                        }}
                    >
                        {description}
                    </div>
                )}
            </div>
            {trailing}
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                data-testid={testId}
                className="grouped-list__item pressable"
                onClick={onClick}
                style={{ width: "100%", textAlign: "left" }}
            >
                {content}
            </button>
        );
    }

    return (
        <div className="grouped-list__item" data-testid={testId}>
            {content}
        </div>
    );
}
