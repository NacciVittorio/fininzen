// Title row for BottomSheet content, replacing the old Modal title bar.
export default function SheetTitle({ children, style }) {
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
