"use client";

import { forwardRef } from "react";
import type { ReactNode } from "react";

type ToggleSwitchProps = {
    checked?: boolean;
    onChange?: (next: boolean) => void;
    label?: ReactNode;
    id?: string;
    disabled?: boolean;
};

const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(
    function ToggleSwitch(
        { checked, onChange, label, id, disabled = false },
        ref,
    ) {
        const handleToggle = () => !disabled && onChange?.(!checked);
        return (
            <label
                htmlFor={id}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <button
                    ref={ref}
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    onClick={handleToggle}
                    disabled={disabled}
                    style={{
                        position: "relative",
                        width: 40,
                        height: 22,
                        borderRadius: 11,
                        border: "1px solid var(--rule)",
                        background: checked
                            ? "var(--success)"
                            : "var(--card-inset)",
                        transition: "background 0.18s",
                        padding: 0,
                        cursor: disabled ? "not-allowed" : "pointer",
                        flexShrink: 0,
                    }}
                >
                    <span
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: 2,
                            left: checked ? 20 : 2,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "var(--card)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            transition: "left 0.18s",
                        }}
                    />
                </button>
                {label && (
                    <span style={{ fontSize: 13, userSelect: "none" }}>
                        {label}
                    </span>
                )}
            </label>
        );
    },
);

export default ToggleSwitch;
