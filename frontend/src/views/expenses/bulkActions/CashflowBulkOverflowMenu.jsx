import { useRef, useState } from "react";
import { Icon, Popover } from "../../../components/ui";

const menuItemStyle = {
  background: "transparent",
  border: 0,
  color: "var(--fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export default function CashflowBulkOverflowMenu({
  T,
  disabled,
  triggerBulkVerify,
  clearCfSelection,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  const runAndClose = (action) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={anchorRef}
        data-testid="cf-bulk-overflow"
        className="btn btn-g btn-sm"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-label={T("cf_bulk_more_actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 8px",
        }}
      >
        <Icon name="moreVertical" size={18} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="end"
        minWidth={200}
        zIndex={1090}
      >
        <div
          role="menu"
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <button
            role="menuitem"
            data-testid="cf-bulk-verify"
            onClick={() => runAndClose(() => triggerBulkVerify(true))}
            disabled={disabled}
            style={menuItemStyle}
          >
            ✓ {T("cf_bulk_verify")}
          </button>
          <button
            role="menuitem"
            data-testid="cf-bulk-unverify"
            onClick={() => runAndClose(() => triggerBulkVerify(false))}
            disabled={disabled}
            style={menuItemStyle}
          >
            ○ {T("cf_bulk_unverify")}
          </button>
          <div
            style={{
              height: 1,
              background: "var(--rule)",
              margin: "4px 0",
            }}
          />
          <button
            role="menuitem"
            onClick={() => runAndClose(clearCfSelection)}
            style={menuItemStyle}
          >
            {T("cf_bulk_clear_selection")}
          </button>
        </div>
      </Popover>
    </>
  );
}
