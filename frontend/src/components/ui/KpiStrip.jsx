export default function KpiStrip({ children, columns, style }) {
  const count = columns || 3;
  return (
    <div
      className="kpi-strip"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        gap: "var(--sp-4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
