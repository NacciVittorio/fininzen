function GroupedList({ title, footer, children, style }) {
  return (
    <section style={{ marginBottom: 20, ...style }}>
      {title && <div className="grouped-list__title">{title}</div>}
      <div className="grouped-list">{children}</div>
      {footer && (
        <div
          style={{
            fontSize: 12,
            color: "var(--fg-soft)",
            lineHeight: 1.45,
            padding: "8px 4px 0",
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

function Item({
  icon,
  label,
  subtitle,
  value,
  action,
  chevron,
  tone,
  onClick,
  style,
  ariaCurrent,
  testId,
}) {
  const Tag = onClick ? "button" : "div";
  const labelColor = tone === "danger" ? "var(--danger)" : "var(--fg)";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`grouped-list__item${onClick ? " pressable" : ""}`}
      onClick={onClick}
      aria-current={ariaCurrent}
      data-testid={testId}
      style={style}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          flex: 1,
        }}
      >
        {icon && (
          <span
            style={{
              fontSize: 18,
              width: 24,
              textAlign: "center",
              color: tone === "danger" ? "var(--danger)" : "var(--fg-soft)",
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 500,
              color: labelColor,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </span>
          {subtitle && (
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--fg-soft)",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </span>
          )}
        </span>
      </div>
      {value != null && (
        <div style={{ fontSize: 13, color: "var(--fg-soft)", flexShrink: 0 }}>
          {value}
        </div>
      )}
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      {chevron && (
        <span
          aria-hidden="true"
          style={{
            color: "var(--fg-faint)",
            fontSize: 17,
            lineHeight: 1,
            flexShrink: 0,
            marginLeft: 2,
          }}
        >
          ›
        </span>
      )}
    </Tag>
  );
}

GroupedList.Item = Item;
export default GroupedList;
