export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-pressed={active}
            onClick={() => onChange(v)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
