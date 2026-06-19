import { useState } from "react";
import { useApp } from "../context/useApp";
import Modal from "./Modal";

// Choice popup shown after a tax-rate change (an asset's override or an
// investment type's rate) that could affect already-created sells. The user
// picks whether to rewrite the tax on existing transactions or only apply the
// new rate going forward. Driven by AppContext.taxPropagationFlow.
export default function TaxPropagationModal() {
  const { T, taxPropagationFlow, setTaxPropagationFlow } = useApp();
  const [busy, setBusy] = useState(false);

  if (!taxPropagationFlow) return null;

  const choose = async (propagation) => {
    if (busy) return;
    setBusy(true);
    try {
      await taxPropagationFlow.run(propagation);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (busy) return;
    setTaxPropagationFlow(null);
  };

  return (
    <Modal title={T("tax_propagation_title")} onClose={cancel}>
      <div
        style={{
          fontSize: 14,
          color: "var(--fg-soft)",
          lineHeight: 1.45,
          marginBottom: 22,
        }}
      >
        {T("tax_propagation_body")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          className="btn btn-p"
          disabled={busy}
          onClick={() => choose("all")}
          style={{ width: "100%" }}
        >
          {T("tax_propagation_all")}
        </button>
        <button
          type="button"
          className="btn btn-g"
          disabled={busy}
          onClick={() => choose("forward")}
          style={{ width: "100%" }}
        >
          {T("tax_propagation_forward")}
        </button>
        <button
          type="button"
          className="btn btn-g"
          disabled={busy}
          onClick={cancel}
          style={{ width: "100%", border: 0 }}
        >
          {T("btn_cancel")}
        </button>
      </div>
    </Modal>
  );
}
