export default function Label({
  accent = false,
  bold = false,
  className = "",
  style,
  children,
}) {
  const cls = [
    "label",
    accent ? "label--accent" : "",
    bold ? "label--bold" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
