const TONE_BORDER = {
  accent: "var(--accent)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};

export default function Card({
  variant,
  tone,
  className = "",
  style,
  children,
  ...rest
}) {
  const cls = ["card", variant ? `card--${variant}` : "", className]
    .filter(Boolean)
    .join(" ");
  const toneStyle = TONE_BORDER[tone]
    ? { borderLeft: `3px solid ${TONE_BORDER[tone]}` }
    : null;
  return (
    <div className={cls} style={{ ...toneStyle, ...style }} {...rest}>
      {children}
    </div>
  );
}
