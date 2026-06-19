// Small round color swatch used in chart legends, grouped-list titles and
// status indicators — replaces emojis / colored squares / decorative ✓.
export default function CategoryDot({
  color = "var(--accent)",
  size = 8,
  style,
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
