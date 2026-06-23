"use client";

import { forwardRef } from "react";
import type { CSSProperties, Ref } from "react";
import { useApp } from "../../context/useApp";

type MonthChange = { month: number; year: number };

type MonthPagerProps = {
    month: number;
    year: number;
    onChange: (next: MonthChange) => void;
    disableForward?: boolean;
    minWidth?: number;
    size?: "sm" | "hero";
    align?: "center" | "between" | "start";
    onLabelClick?: () => void;
    labelRef?: Ref<HTMLElement>;
};

const MonthPager = forwardRef<HTMLDivElement, MonthPagerProps>(
    function MonthPager(
        {
            month,
            year,
            onChange,
            disableForward = false,
            minWidth = 160,
            size = "sm",
            align = "center",
            onLabelClick,
            labelRef,
        },
        ref,
    ) {
        const { MONTHS } = useApp();
        const goPrev = () => {
            if (month === 1) onChange({ month: 12, year: year - 1 });
            else onChange({ month: month - 1, year });
        };
        const goNext = () => {
            if (disableForward) return;
            if (month === 12) onChange({ month: 1, year: year + 1 });
            else onChange({ month: month + 1, year });
        };
        const isHero = size === "hero";
        const btnSize = isHero ? 28 : 32;
        const chevronFontSize = isHero ? 14 : 14;
        const gap = isHero ? 12 : 8;
        const btnStyle = (disabled: boolean): CSSProperties => ({
            background: "var(--card-inset)",
            border: "1px solid var(--rule)",
            color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
            borderRadius: 999,
            width: btnSize,
            height: btnSize,
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: chevronFontSize,
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s, color 0.15s",
            flexShrink: 0,
        });
        const labelStyle: CSSProperties = isHero
            ? {
                  font: "var(--w-heading) clamp(14px, 3.2vw, 18px) / 1 var(--font-sans)",
                  letterSpacing: "var(--ls-h-small, -0.01em)",
                  color: "var(--fg)",
                  textAlign: "center",
                  flex: 1,
              }
            : {
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "var(--ls-label)",
                  textTransform: "uppercase",
                  color: "var(--fg)",
                  minWidth,
                  textAlign: "center",
                  fontFamily: "var(--font-sans)",
              };
        const justify =
            align === "between"
                ? "space-between"
                : align === "start"
                  ? "flex-start"
                  : "center";
        const labelText = `${MONTHS?.[month - 1] || ""} ${year}`;
        const labelContent = onLabelClick ? (
            <button
                type="button"
                ref={labelRef as Ref<HTMLButtonElement>}
                onClick={onLabelClick}
                style={{
                    ...labelStyle,
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                }}
            >
                {labelText}
            </button>
        ) : (
            <span ref={labelRef as Ref<HTMLSpanElement>} style={labelStyle}>
                {labelText}
            </span>
        );

        return (
            <div
                ref={ref}
                style={{
                    display: isHero ? "flex" : "inline-flex",
                    alignItems: "center",
                    justifyContent: justify,
                    gap,
                    width: isHero ? "100%" : undefined,
                }}
            >
                <button
                    type="button"
                    onClick={goPrev}
                    style={btnStyle(false)}
                    aria-label="Previous"
                >
                    ‹
                </button>
                {labelContent}
                <button
                    type="button"
                    onClick={goNext}
                    disabled={disableForward}
                    style={btnStyle(disableForward)}
                    aria-label="Next"
                >
                    ›
                </button>
            </div>
        );
    },
);

export default MonthPager;
