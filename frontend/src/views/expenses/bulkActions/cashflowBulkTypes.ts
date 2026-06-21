import type { getCfBulkActionsAllowed } from "../../../context/bulkSelectionModel";
import type { BulkRequest } from "../../../context/useCashflowBulkActions";

// Shared prop contracts for the cashflow bulk-action leaves, anchored on the
// canonical BulkRequest / getCfBulkActionsAllowed from the cashflow hook so the
// pieces stay in lock-step with the real bulk API.
export type { BulkRequest };
export type ApplyCfBulk = (request: BulkRequest) => Promise<unknown>;
export type PendingBulkVerify = { value: boolean };
export type BulkActionsAllowed = ReturnType<typeof getCfBulkActionsAllowed>;
