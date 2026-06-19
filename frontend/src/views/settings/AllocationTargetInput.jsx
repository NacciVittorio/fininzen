import { useEffect, useState } from "react";
import { saveAllocationTarget } from "../../api/planning";

export function AllocationTargetInput({ item, apiFetch, fetchAllocationData }) {
  const [value, setValue] = useState(item.target_pct ?? "");

  useEffect(() => {
    setValue(item.target_pct ?? "");
  }, [item.target_pct]);

  const save = async () => {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;
    await saveAllocationTarget(apiFetch, {
      investment_type: item.id,
      target_percent: val,
    });
    fetchAllocationData();
  };

  return (
    <input
      className="inp"
      type="number"
      min="0"
      max="100"
      step="0.5"
      placeholder="0"
      style={{ width: 90, textAlign: "right" }}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
    />
  );
}
