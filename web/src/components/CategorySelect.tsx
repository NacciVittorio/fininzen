"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Category } from "../api/types";

const DOT: CSSProperties = {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    marginRight: 8,
    flexShrink: 0,
};

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

export default function CategorySelect({
    value = "",
    values = [],
    onChange,
    onMultiChange,
    multiple = false,
    initialOpen = false,
    selectedLabel = "selected",
    categoryType = "all",
    placeholder = "—",
    categories = [],
    usePortal = false,
    disabled = false,
    id,
}: {
    value?: string | number;
    values?: Array<string | number>;
    onChange?: (value: string) => void;
    onMultiChange?: (values: string[]) => void;
    multiple?: boolean;
    initialOpen?: boolean;
    selectedLabel?: ReactNode;
    categoryType?: string;
    placeholder?: ReactNode;
    categories?: readonly Category[];
    usePortal?: boolean;
    disabled?: boolean;
    id?: string;
}) {
    const [open, setOpen] = useState(disabled ? false : initialOpen);
    const [expandedParent, setExpandedParent] = useState<number | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);

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

    // Defensive: some callers (e.g. BulkEditFields) type `categories` as `unknown`,
    // and the `= []` default only guards `undefined`. A non-array value from an
    // error/loading state would otherwise throw "filter is not a function".
    const catList: readonly Category[] = Array.isArray(categories)
        ? categories
        : [];

    const roots = catList.filter(
        (c) =>
            !c.parent &&
            (categoryType === "all" || c.category_type === categoryType),
    );

    const childrenOf = (parentId: number) =>
        catList.filter((c) => c.parent === parentId);

    const selected = catList.find((c) => String(c.id) === String(value));
    const selectedValues = values.map(String);
    const selectedMany = catList.filter((c) =>
        selectedValues.includes(String(c.id)),
    );

    const commit = (cat: Category) => {
        if (multiple) {
            const key = String(cat.id);
            const next = selectedValues.includes(key)
                ? selectedValues.filter((v) => v !== key)
                : [...selectedValues, key];
            onMultiChange?.(next);
            return;
        }
        onChange?.(String(cat.id));
        setOpen(false);
        setExpandedParent(null);
    };

    const clear = () => {
        if (multiple) onMultiChange?.([]);
        else onChange?.("");
        setOpen(false);
        setExpandedParent(null);
    };

    const handleParentClick = (cat: Category) => {
        const subs = childrenOf(cat.id);
        if (subs.length === 0) {
            commit(cat);
            return;
        }
        setExpandedParent((prev) => (prev === cat.id ? null : cat.id));
    };

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <button
                ref={triggerRef}
                id={id}
                data-testid="category-select-trigger"
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => !disabled && setOpen((o) => !o)}
                style={{
                    background: "var(--card-inset)",
                    border: `1px solid ${open ? "var(--accent-ring)" : "var(--rule)"}`,
                    borderRadius: 10,
                    color:
                        selected || selectedMany.length
                            ? "var(--fg)"
                            : "var(--fg-soft)",
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
                <span style={{ display: "flex", alignItems: "center" }}>
                    {selected && (
                        <span style={{ ...DOT, background: selected.color }} />
                    )}
                    {multiple
                        ? selectedMany.length
                            ? selectedMany.length === 1
                                ? `${selectedMany[0]?.icon} ${selectedMany[0]?.name}`
                                : `${selectedMany.length} ${selectedLabel}`
                            : placeholder
                        : selected
                          ? `${selected.icon} ${selected.name}`
                          : placeholder}
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
                            data-testid="category-select-dropdown"
                            style={dropdownStyle}
                        >
                            <button
                                type="button"
                                onClick={clear}
                                style={itemStyle(
                                    multiple
                                        ? selectedValues.length === 0
                                        : !value,
                                )}
                            >
                                <span>{placeholder}</span>
                            </button>

                            {roots.map((cat) => {
                                const subs = childrenOf(cat.id);
                                const isExpanded = expandedParent === cat.id;
                                const isActive = multiple
                                    ? selectedValues.includes(String(cat.id)) ||
                                      subs.some((s) =>
                                          selectedValues.includes(String(s.id)),
                                      )
                                    : String(value) === String(cat.id) ||
                                      subs.some(
                                          (s) => String(s.id) === String(value),
                                      );

                                return (
                                    <div key={cat.id}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleParentClick(cat)
                                            }
                                            style={itemStyle(isActive)}
                                        >
                                            <span
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        ...DOT,
                                                        background: cat.color,
                                                    }}
                                                />
                                                {cat.icon} {cat.name}
                                            </span>
                                            {subs.length > 0 && (
                                                <span style={{ fontSize: 10 }}>
                                                    {isExpanded ? "▲" : "▼"}
                                                </span>
                                            )}
                                        </button>

                                        {isExpanded && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => commit(cat)}
                                                    style={{
                                                        ...itemStyle(
                                                            multiple
                                                                ? selectedValues.includes(
                                                                      String(
                                                                          cat.id,
                                                                      ),
                                                                  )
                                                                : String(
                                                                      cat.id,
                                                                  ) ===
                                                                      String(
                                                                          value,
                                                                      ),
                                                        ),
                                                        paddingLeft: 32,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                ...DOT,
                                                                background:
                                                                    cat.color,
                                                            }}
                                                        />
                                                        {cat.icon} {cat.name}
                                                    </span>
                                                </button>
                                                {subs.map((sub) => (
                                                    <button
                                                        key={sub.id}
                                                        type="button"
                                                        onClick={() =>
                                                            commit(sub)
                                                        }
                                                        style={{
                                                            ...itemStyle(
                                                                multiple
                                                                    ? selectedValues.includes(
                                                                          String(
                                                                              sub.id,
                                                                          ),
                                                                      )
                                                                    : String(
                                                                          sub.id,
                                                                      ) ===
                                                                          String(
                                                                              value,
                                                                          ),
                                                            ),
                                                            paddingLeft: 32,
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    ...DOT,
                                                                    background:
                                                                        sub.color,
                                                                }}
                                                            />
                                                            {sub.icon}{" "}
                                                            {sub.name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                    return usePortal && typeof document !== "undefined"
                        ? createPortal(dropdown, document.body)
                        : dropdown;
                })()}
        </div>
    );
}
