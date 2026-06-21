import type { Translator } from "../../types";
import BulkEditModal from "../../components/BulkEditModal";
import CashflowBulkDeleteModal from "./bulkActions/CashflowBulkDeleteModal";
import CashflowBulkToolbar from "./bulkActions/CashflowBulkToolbar";
import CashflowBulkVerifyModal from "./bulkActions/CashflowBulkVerifyModal";
import CashflowKindMismatchToast from "./bulkActions/CashflowKindMismatchToast";
import type {
  ApplyCfBulk,
  BulkActionsAllowed,
  PendingBulkVerify,
} from "./bulkActions/cashflowBulkTypes";

export default function CashflowBulkActions({
  T,
  showKindMismatchToast,
  cfSelectionMode,
  cfSelectedCount,
  cfBulkLoading,
  cfBulkError,
  cfBulkEditOpen,
  setCfBulkEditOpen,
  cfSelectionKind,
  cfSelectAllFiltered,
  bulkActionsAllowed,
  pendingBulkVerify,
  setPendingBulkVerify,
  bulkDeleteConfirm,
  setBulkDeleteConfirm,
  triggerBulkVerify,
  clearCfSelection,
  exitCfSelectionMode,
  applyCfBulk,
}: {
  T: Translator;
  showKindMismatchToast: boolean;
  cfSelectionMode: boolean;
  cfSelectedCount: number;
  cfBulkLoading: boolean;
  cfBulkError?: string | null;
  cfBulkEditOpen: boolean;
  setCfBulkEditOpen: (value: boolean) => void;
  cfSelectionKind?: string | null;
  cfSelectAllFiltered: boolean;
  bulkActionsAllowed: BulkActionsAllowed;
  pendingBulkVerify: PendingBulkVerify | null;
  setPendingBulkVerify: (pending: PendingBulkVerify | null) => void;
  bulkDeleteConfirm: boolean;
  setBulkDeleteConfirm: (value: boolean) => void;
  triggerBulkVerify: (value: boolean) => void;
  clearCfSelection: () => void;
  exitCfSelectionMode: () => void;
  applyCfBulk: ApplyCfBulk;
}) {
  return (
    <>
      {showKindMismatchToast && <CashflowKindMismatchToast T={T} />}

      {cfSelectionMode && cfSelectedCount > 0 && (
        <CashflowBulkToolbar
          T={T}
          cfSelectedCount={cfSelectedCount}
          cfBulkLoading={cfBulkLoading}
          cfSelectionKind={cfSelectionKind}
          bulkActionsAllowed={bulkActionsAllowed}
          setCfBulkEditOpen={setCfBulkEditOpen}
          triggerBulkVerify={triggerBulkVerify}
          clearCfSelection={clearCfSelection}
          setBulkDeleteConfirm={setBulkDeleteConfirm}
          exitCfSelectionMode={exitCfSelectionMode}
        />
      )}

      {cfBulkEditOpen && (
        <BulkEditModal onClose={() => setCfBulkEditOpen(false)} />
      )}

      {pendingBulkVerify && (
        <CashflowBulkVerifyModal
          T={T}
          pendingBulkVerify={pendingBulkVerify}
          setPendingBulkVerify={setPendingBulkVerify}
          cfSelectedCount={cfSelectedCount}
          cfSelectAllFiltered={cfSelectAllFiltered}
          cfBulkError={cfBulkError}
          cfBulkLoading={cfBulkLoading}
          applyCfBulk={applyCfBulk}
        />
      )}

      {bulkDeleteConfirm && (
        <CashflowBulkDeleteModal
          T={T}
          setBulkDeleteConfirm={setBulkDeleteConfirm}
          cfSelectedCount={cfSelectedCount}
          cfBulkError={cfBulkError}
          cfBulkLoading={cfBulkLoading}
          applyCfBulk={applyCfBulk}
        />
      )}
    </>
  );
}
