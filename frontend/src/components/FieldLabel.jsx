export default function FieldLabel({ text }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--fg-soft)",
        marginBottom: 5,
        textTransform: "uppercase",
        letterSpacing: 0,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}
