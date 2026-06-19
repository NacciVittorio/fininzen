import Modal from "../../components/Modal";

export function DeleteRecurringModal({
  T,
  target,
  saving,
  onClose,
  deleteRecurring,
}) {
  return (
    <Modal title={T("modal_are_you_sure")} onClose={onClose}>
      <DeleteScheduleModalBody
        T={T}
        label={`${T("recurring_delete_confirm")} "${target.description}"?`}
        saving={saving}
        onClose={onClose}
        onDelete={async () => {
          const ok = await deleteRecurring(target);
          if (ok) onClose();
        }}
      />
    </Modal>
  );
}

export function DeletePacModal({ T, target, saving, onClose, deletePac }) {
  return (
    <Modal title={T("modal_are_you_sure")} onClose={onClose}>
      <DeleteScheduleModalBody
        T={T}
        label={`${T("pac_delete_confirm")} "${target.name}"?`}
        saving={saving}
        onClose={onClose}
        onDelete={async () => {
          const ok = await deletePac(target);
          if (ok) onClose();
        }}
      />
    </Modal>
  );
}

function DeleteScheduleModalBody({ T, label, saving, onClose, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>{label}</div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-g" onClick={onClose}>
          {T("btn_cancel")}
        </button>
        <button className="btn btn-r" disabled={saving} onClick={onDelete}>
          {saving ? "..." : T("btn_delete")}
        </button>
      </div>
    </div>
  );
}
