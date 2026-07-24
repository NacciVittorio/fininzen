"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/useApp";
import { Icon } from "./ui";

// Custom, native-free single-select dropdown for FLAT option lists. Modelled on
// CategorySelect (same trigger + `var(--card)` panel + click-outside), minus the
// parent/child logic. Everything renders in app DOM, so the option list always
// follows the app theme — unlike a native <select>, whose popup is painted by the
// browser and, with `appearance:none`, can ignore `color-scheme` and render white
// on a dark page (the "Black Hole" Chrome-theme bug on CashFlow).

export type SelectOption = {
    value: string;
    label: ReactNode;
    // Optional leading glyph (kept out of `label` so it never wraps away from it).
    icon?: ReactNode;
    // Plain text for type-to-search matching when `label` isn't a string.
    keywords?: string;
};

// Below this many options the search box is hidden — it would just be noise.
const SEARCH_THRESHOLD = 8;

function itemStyle(active: boolean): CSSProperties {
    return {
        background: active ? "var(--accent-soft)" : "transparent",
        border: "none",
        color: active ? "var(--fg)" : "var(--fg-soft)",
        padding: "10px 14px",
        fontSize: 14,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    };
}

const ellipsis: CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

export default function Select({
    id,
    value = "",
    onChange,
    options,
    placeholder = "—",
    disabled = false,
    usePortal = false,
    searchThreshold = SEARCH_THRESHOLD,
    "data-testid": testId,
}: {
    id?: string;
    value?: string;
    onChange: (value: string) => void;
    options: readonly SelectOption[];
    placeholder?: ReactNode;
    disabled?: boolean;
    usePortal?: boolean;
    searchThreshold?: number;
    "data-testid"?: string;
}) {
    const { T } = useApp();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);

    // Reset the type-to-filter query whenever the dropdown closes so it reopens clean.
    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                ref.current &&
                !ref.current.contains(target) &&
                !dropdownRef.current?.contains(target)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Portal positioning (fixed, viewport-aware) — ported verbatim from
    // CategorySelect so a portalled dropdown escapes clipping ancestors.
    useLayoutEffect(() => {
        if (!open || !usePortal || !triggerRef.current) return;

        const positionDropdown = () => {
            if (!triggerRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const vv = window.visualViewport;
            const viewportWidth = vv?.width || window.innerWidth;
            const viewportHeight = vv?.height || window.innerHeight;
            const viewportTop = vv?.offsetTop || 0;
            const margin = 8;
            const maxHeight = 260;
            const bottomSpace =
                viewportTop + viewportHeight - rect.bottom - margin;
            const topSpace = rect.top - viewportTop - margin;
            const openAbove = bottomSpace < 180 && topSpace > bottomSpace;
            const height = Math.min(
                maxHeight,
                Math.max(openAbove ? topSpace : bottomSpace, 120),
            );
            const left = Math.min(
                Math.max(rect.left, margin),
                Math.max(margin, viewportWidth - rect.width - margin),
            );
            const top = openAbove ? rect.top - height - 4 : rect.bottom + 4;

            setPortalStyle({
                position: "fixed",
                top: Math.max(viewportTop + margin, Math.round(top)),
                left: Math.round(left),
                width: Math.round(rect.width),
                maxHeight: height,
                zIndex: 1300,
            });
        };

        positionDropdown();
        window.addEventListener("resize", positionDropdown);
        window.addEventListener("scroll", positionDropdown, true);
        window.visualViewport?.addEventListener("resize", positionDropdown);
        window.visualViewport?.addEventListener("scroll", positionDropdown);
        return () => {
            window.removeEventListener("resize", positionDropdown);
            window.removeEventListener("scroll", positionDropdown, true);
            window.visualViewport?.removeEventListener(
                "resize",
                positionDropdown,
            );
            window.visualViewport?.removeEventListener(
                "scroll",
                positionDropdown,
            );
        };
    }, [open, usePortal]);

    // Defensive: a non-array from an error/loading state would throw on .filter.
    const optionList: readonly SelectOption[] = Array.isArray(options)
        ? options
        : [];

    const q = query.trim().toLowerCase();
    const searching = q.length > 0;
    const textOf = (o: SelectOption) =>
        (
            o.keywords ?? (typeof o.label === "string" ? o.label : "")
        ).toLowerCase();
    const visibleOptions = searching
        ? optionList.filter((o) => textOf(o).includes(q))
        : optionList;
    const showSearch = optionList.length > searchThreshold;

    const selected = optionList.find((o) => String(o.value) === String(value));

    const commit = (val: string) => {
        onChange(val);
        setOpen(false);
    };

    const optionTestId = (val: string) =>
        testId ? `${testId}-option-${val}` : undefined;

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                disabled={disabled}
                data-testid={testId}
                data-value={String(value)}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => !disabled && setOpen((o) => !o)}
                style={{
                    background: "var(--card-inset)",
                    border: `1px solid ${open ? "var(--accent-ring)" : "var(--rule)"}`,
                    borderRadius: 10,
                    color: selected ? "var(--fg)" : "var(--fg-soft)",
                    padding: "10px 14px",
                    fontSize: 16,
                    width: "100%",
                    textAlign: "left",
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    transition: "border 0.15s",
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                <span
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                    }}
                >
                    {selected?.icon != null && (
                        <span style={{ flexShrink: 0 }}>{selected.icon}</span>
                    )}
                    <span style={ellipsis}>
                        {selected ? selected.label : placeholder}
                    </span>
                </span>
                <span style={{ color: "var(--fg-soft)", fontSize: 11 }}>
                    {open ? "▲" : "▼"}
                </span>
            </button>

            {open &&
                (() => {
                    const dropdownStyle: CSSProperties = usePortal
                        ? {
                              ...(portalStyle || { display: "none" }),
                              background: "var(--card)",
                              border: "1px solid var(--rule)",
                              borderRadius: 10,
                              boxShadow: "var(--shadow-soft)",
                              overflowY: "auto",
                          }
                        : {
                              position: "absolute",
                              top: "calc(100% + 4px)",
                              left: 0,
                              right: 0,
                              background: "var(--card)",
                              border: "1px solid var(--rule)",
                              borderRadius: 10,
                              boxShadow: "var(--shadow-soft)",
                              zIndex: 200,
                              maxHeight: 260,
                              overflowY: "auto",
                          };
                    const dropdown = (
                        <div
                            ref={dropdownRef}
                            role="listbox"
                            data-testid={
                                testId ? `${testId}-dropdown` : undefined
                            }
                            style={dropdownStyle}
                        >
                            {showSearch && (
                                <div
                                    style={{
                                        position: "sticky",
                                        top: 0,
                                        zIndex: 1,
                                        background: "var(--card)",
                                        padding: 8,
                                        borderBottom: "1px solid var(--rule)",
                                    }}
                                >
                                    <div style={{ position: "relative" }}>
                                        <span
                                            aria-hidden
                                            style={{
                                                position: "absolute",
                                                left: 12,
                                                top: "50%",
                                                transform: "translateY(-50%)",
                                                color: "var(--fg-soft)",
                                                display: "flex",
                                                alignItems: "center",
                                                pointerEvents: "none",
                                            }}
                                        >
                                            <Icon name="search" size={15} />
                                        </span>
                                        <input
                                            type="search"
                                            value={query}
                                            onChange={(e) =>
                                                setQuery(e.target.value)
                                            }
                                            placeholder={T(
                                                "category_search_placeholder",
                                            )}
                                            aria-label={T(
                                                "category_search_placeholder",
                                            )}
                                            style={{
                                                width: "100%",
                                                background: "var(--card-inset)",
                                                border: "1px solid var(--rule)",
                                                borderRadius: 10,
                                                color: "var(--fg)",
                                                padding: "9px 34px",
                                                fontSize: 16,
                                                fontFamily: "inherit",
                                                outline: "none",
                                                boxSizing: "border-box",
                                            }}
                                        />
                                        {query && (
                                            <button
                                                type="button"
                                                aria-label={T(
                                                    "cf_search_clear",
                                                )}
                                                onClick={() => setQuery("")}
                                                style={{
                                                    position: "absolute",
                                                    right: 6,
                                                    top: "50%",
                                                    transform:
                                                        "translateY(-50%)",
                                                    background: "transparent",
                                                    border: "none",
                                                    color: "var(--fg-soft)",
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    padding: 4,
                                                }}
                                            >
                                                <Icon name="x" size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                role="option"
                                aria-selected={!value}
                                onClick={() => commit("")}
                                data-testid={optionTestId("")}
                                style={itemStyle(!value)}
                            >
                                <span style={ellipsis}>{placeholder}</span>
                            </button>

                            {visibleOptions.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    role="option"
                                    aria-selected={
                                        String(o.value) === String(value)
                                    }
                                    onClick={() => commit(o.value)}
                                    data-testid={optionTestId(o.value)}
                                    style={itemStyle(
                                        String(o.value) === String(value),
                                    )}
                                >
                                    <span
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            minWidth: 0,
                                        }}
                                    >
                                        {o.icon != null && (
                                            <span style={{ flexShrink: 0 }}>
                                                {o.icon}
                                            </span>
                                        )}
                                        <span style={ellipsis}>{o.label}</span>
                                    </span>
                                </button>
                            ))}

                            {searching && visibleOptions.length === 0 && (
                                <div
                                    style={{
                                        padding: "12px 14px",
                                        fontSize: 14,
                                        color: "var(--fg-soft)",
                                        textAlign: "center",
                                    }}
                                >
                                    {T("category_search_empty")}
                                </div>
                            )}
                        </div>
                    );
                    return usePortal && typeof document !== "undefined"
                        ? createPortal(dropdown, document.body)
                        : dropdown;
                })()}
        </div>
    );
}
