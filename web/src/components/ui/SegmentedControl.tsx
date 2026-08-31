"use client";

import type { ReactNode } from "react";

type SegmentedOption =
    string | { value: string; label: ReactNode; testId?: string };

type SegmentedControlProps = {
    options: readonly SegmentedOption[];
    value?: string;
    onChange: (value: string) => void;
};

export default function SegmentedControl({
    options,
    value,
    onChange,
}: SegmentedControlProps) {
    return (
        <div className="segmented" role="tablist">
            {options.map((opt) => {
                const v = typeof opt === "string" ? opt : opt.value;
                const label = typeof opt === "string" ? opt : opt.label;
                const testId = typeof opt === "string" ? undefined : opt.testId;
                const active = v === value;
                return (
                    <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={testId}
                        onClick={() => onChange(v)}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
