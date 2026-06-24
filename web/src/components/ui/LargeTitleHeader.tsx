"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import PageHeader from "./PageHeader";

// iOS "large title" header: a big title/hero block in flow plus an
// always-mounted compact bar pinned with position:sticky. A 1px sentinel
// placed after the hero drives the collapse via IntersectionObserver (works
// whether the page scrolls the window or a PullToRefresh wrapper). When the
// sentinel leaves the top of the viewport the bar gains a translucent
// blurred background and the compact title fades in.
type LargeTitleHeaderProps = {
    title?: ReactNode;
    compactTitle?: ReactNode;
    eyebrow?: ReactNode;
    subtitle?: ReactNode;
    hero?: ReactNode;
    actions?: ReactNode;
    compactValue?: ReactNode;
    children?: ReactNode;
    style?: CSSProperties;
};

export default function LargeTitleHeader({
    title,
    compactTitle,
    eyebrow,
    subtitle,
    hero,
    actions,
    compactValue,
    children,
    style,
}: LargeTitleHeaderProps) {
    const barTitle = compactTitle ?? (typeof title === "string" ? title : null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [stuck, setStuck] = useState(false);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || typeof IntersectionObserver === "undefined")
            return undefined;
        const io = new IntersectionObserver(
            ([entry]) => setStuck(!entry?.isIntersecting),
            // Top inset ≈ bar height: fire when the sentinel slides under the bar,
            // not when it reaches the very top of the viewport.
            { rootMargin: "-48px 0px 0px 0px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <>
            <div
                className={`lt-header__bar${stuck ? " lt-header__bar--stuck" : ""}${
                    actions ? "" : " lt-header__bar--bare"
                }`}
                data-stuck={stuck ? "true" : undefined}
            >
                <div className="lt-header__bar-title" aria-hidden={!stuck}>
                    <span className="lt-header__bar-text">{barTitle}</span>
                    {compactValue != null && (
                        <span className="lt-header__bar-value num">
                            {compactValue}
                        </span>
                    )}
                </div>
                {actions && (
                    <div className="lt-header__bar-actions">{actions}</div>
                )}
            </div>

            <PageHeader
                eyebrow={eyebrow}
                title={title}
                subtitle={subtitle}
                style={style}
            >
                {hero}
            </PageHeader>

            <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

            {children}
        </>
    );
}
