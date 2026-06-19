import type { ReactNode } from "react";
import { Label } from "../../../components/ui";

type ChildrenProps = { children: ReactNode };

export function SectionLabel({ children }: ChildrenProps) {
    return <Label style={{ marginBottom: 10 }}>{children}</Label>;
}

export function EmptyCardText({ children }: ChildrenProps) {
    return (
        <div
            style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "20px 0",
            }}
        >
            {children}
        </div>
    );
}
