export default function Pill({
  tone = "success",
  className = "",
  style,
  children,
}) {
  const cls = [`pill-${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}
