import Card from "./Card";
import Label from "./Label";
import ProgressBar from "./ProgressBar";

const SELECTED_RING_COLOR = {
  positive: "var(--success)",
  danger: "var(--danger)",
  accent: "var(--accent)",
  warning: "var(--warning)",
  neutral: "var(--accent)",
};

export default function KpiCard({
  label,
  value,
  tone = "neutral",
  caption,
  progress,
  progressTone,
  children,
  className,
  style,
  valueStyle,
  onClick,
  selected = false,
  selectedTone,
  interactive,
  compact = false,
  ...rest
}) {
  const isInteractive = interactive ?? !!onClick;
  const ringTone = selectedTone || tone;
  const ringColor = SELECTED_RING_COLOR[ringTone] || SELECTED_RING_COLOR.accent;

  const selectedStyle = selected
    ? { boxShadow: `inset 0 0 0 2px ${ringColor}` }
    : null;
  const interactiveStyle = isInteractive ? { cursor: "pointer" } : null;

  const handleKeyDown = (e) => {
    if (!isInteractive || !onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  };

  const a11yProps = isInteractive
    ? {
        role: "button",
        tabIndex: 0,
        "aria-pressed": selected,
        onKeyDown: handleKeyDown,
      }
    : {};

  const compactStyle = compact ? { padding: "10px 12px" } : null;

  return (
    <Card
      className={className}
      style={{
        ...interactiveStyle,
        ...selectedStyle,
        ...compactStyle,
        ...style,
      }}
      onClick={onClick}
      {...rest}
      {...a11yProps}
    >
      {label && <Label>{label}</Label>}
      {value != null && (
        <div
          className={`kpi-value kpi-value--${tone}${compact ? " kpi-value--compact" : ""}`}
          style={{ marginTop: compact ? 4 : 12, ...valueStyle }}
        >
          {value}
        </div>
      )}
      {caption && (
        <div
          style={{
            color: "var(--fg-soft)",
            fontSize: compact ? 11 : 13,
            marginTop: compact ? 4 : 8,
            lineHeight: 1.4,
          }}
        >
          {caption}
        </div>
      )}
      {progress != null && (
        <div style={{ marginTop: 16 }}>
          <ProgressBar value={progress} tone={progressTone || tone} />
        </div>
      )}
      {children}
    </Card>
  );
}
