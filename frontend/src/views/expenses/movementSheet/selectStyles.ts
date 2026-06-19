import type { CSSProperties } from "react";

export const selectLikeCategoryShellStyle: CSSProperties = {
    position: "relative",
    background: "var(--card-inset)",
    border: "1px solid var(--rule)",
    borderRadius: 10,
    overflow: "hidden",
};

export const selectLikeCategoryStyle: CSSProperties = {
    width: "100%",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    background: "transparent",
    border: 0,
    color: "var(--fg)",
    padding: "10px 36px 10px 14px",
    fontSize: 16,
    fontFamily: "inherit",
    lineHeight: 1.2,
};

export const selectLikeCategoryChevronStyle: CSSProperties = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 11,
    color: "var(--fg-soft)",
    pointerEvents: "none",
};
