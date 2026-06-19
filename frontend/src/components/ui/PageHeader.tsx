import type { CSSProperties, ReactNode } from "react";

type PageHeaderProps = {
    eyebrow?: ReactNode;
    title?: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
    style?: CSSProperties;
};

export default function PageHeader({
    eyebrow,
    title,
    subtitle,
    actions,
    children,
    style,
}: PageHeaderProps) {
    return (
        <header
            className="page-header"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 20,
                ...style,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                    {eyebrow && (
                        <div
                            className="label label--accent"
                            style={{ marginBottom: 8 }}
                        >
                            {eyebrow}
                        </div>
                    )}
                    {title && (
                        <h1 className="page-title" style={{ margin: 0 }}>
                            {title}
                        </h1>
                    )}
                    {subtitle && (
                        <div
                            style={{
                                color: "var(--fg-soft)",
                                fontSize: 14,
                                marginTop: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                </div>
                {actions && (
                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                        }}
                    >
                        {actions}
                    </div>
                )}
            </div>
            {children}
        </header>
    );
}
