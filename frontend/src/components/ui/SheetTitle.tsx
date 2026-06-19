import type { CSSProperties, ReactNode } from "react";

// Title row for BottomSheet content, replacing the old Modal title bar.
type SheetTitleProps = {
    children?: ReactNode;
    style?: CSSProperties;
};

export default function SheetTitle({ children, style }: SheetTitleProps) {
    return (
        <h3
            style={{
                margin: "0 0 14px",
                fontSize: 17,
                fontWeight: 800,
                color: "var(--fg)",
                letterSpacing: "var(--ls-h-small)",
                ...style,
            }}
        >
            {children}
        </h3>
    );
}
