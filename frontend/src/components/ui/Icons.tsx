import type { ComponentPropsWithoutRef, ReactNode } from "react";

const ICON_PATHS: Record<string, ReactNode> = {
    dashboard: (
        <>
            <path d="M4 19V9" />
            <path d="M10 19V5" />
            <path d="M16 19v-7" />
            <path d="M22 19H2" />
        </>
    ),
    cashflow: (
        <>
            <path d="M4 7h16v10H4z" />
            <path d="M8 11h.01" />
            <path d="M16 13h.01" />
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        </>
    ),
    accounts: (
        <>
            <path d="M3 10h18" />
            <path d="M5 10V8l7-4 7 4v2" />
            <path d="M6 10v8" />
            <path d="M10 10v8" />
            <path d="M14 10v8" />
            <path d="M18 10v8" />
            <path d="M4 18h16" />
        </>
    ),
    investments: (
        <>
            <path d="M3 17 9 11l4 4 8-9" />
            <path d="M15 6h6v6" />
        </>
    ),
    fire: (
        <>
            <path d="M12 22c4 0 7-2.7 7-6.6 0-2.3-1.2-4.2-3.2-5.8.1 2.2-1 3.4-2.4 4.1.3-3.5-1.5-6.2-4.4-8.7.3 3.5-2.1 5.7-3.2 7.6A5.4 5.4 0 0 0 5 15.4C5 19.3 8 22 12 22z" />
        </>
    ),
    settings: (
        <>
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" />
        </>
    ),
    category: (
        <>
            <path d="M4 7h16" />
            <path d="M7 7V5h10v2" />
            <path d="M6 7l1 12h10l1-12" />
            <path d="M9 11h6" />
        </>
    ),
    status: (
        <>
            <path d="m4 12 5 5L20 6" />
        </>
    ),
    calendar: (
        <>
            <path d="M7 3v4" />
            <path d="M17 3v4" />
            <path d="M4 9h16" />
            <path d="M5 5h14v16H5z" />
        </>
    ),
    transfer: (
        <>
            <path d="M7 7h13l-3-3" />
            <path d="M17 20l3-3H7" />
        </>
    ),
    refresh: (
        <>
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M18 11a6 6 0 0 0-10-4.5L4 10" />
            <path d="M6 13a6 6 0 0 0 10 4.5l4-3.5" />
        </>
    ),
    plus: (
        <>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
        </>
    ),
    x: (
        <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </>
    ),
    chevronDown: (
        <>
            <path d="m6 9 6 6 6-6" />
        </>
    ),
    moreVertical: (
        <>
            <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
        </>
    ),
    trash: (
        <>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 14h10l1-14" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
        </>
    ),
    edit: (
        <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </>
    ),
    archive: (
        <>
            <path d="M3 6h18v4H3z" />
            <path d="M5 10v10h14V10" />
            <path d="M10 14h4" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    eyeOff: (
        <>
            <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-4.94" />
            <path d="M9.9 5.24A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="m3 3 18 18" />
        </>
    ),
    sort: (
        <>
            <path d="M7 4v16" />
            <path d="m3 8 4-4 4 4" />
            <path d="M17 20V4" />
            <path d="m13 16 4 4 4-4" />
        </>
    ),
};

type IconProps = ComponentPropsWithoutRef<"svg"> & {
    name: string;
    size?: number;
    strokeWidth?: number;
};

export default function Icon({
    name,
    size = 18,
    strokeWidth = 2,
    ...props
}: IconProps) {
    const path = ICON_PATHS[name];
    if (!path) return null;
    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            {...props}
        >
            {path}
        </svg>
    );
}
