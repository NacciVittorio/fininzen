export default function CurrencyInputShell({ asset, children }) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      <span
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--fg-soft)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        {asset?.currency || "EUR"}
      </span>
    </div>
  );
}
