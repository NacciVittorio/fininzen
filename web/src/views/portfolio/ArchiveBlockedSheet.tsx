"use client";

import { BottomSheet, SheetTitle } from "../../components/ui";
import type { Translator } from "../../types";

export type ArchiveBlockedModal =
    | { type: "shares"; assetName: string; shares: string }
    | {
          type: "balance";
          assetName: string;
          currentValue: string;
          currency: string;
      };

export default function ArchiveBlockedSheet({
    archiveBlockedModal,
    setArchiveBlockedModal,
    T,
}: {
    archiveBlockedModal: ArchiveBlockedModal | null;
    setArchiveBlockedModal: (modal: ArchiveBlockedModal | null) => void;
    T: Translator;
}) {
    return (
        <BottomSheet
            open={!!archiveBlockedModal}
            onClose={() => setArchiveBlockedModal(null)}
            ariaLabel={T("archive_investment_blocked_title")}
        >
            {archiveBlockedModal && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        padding: "8px 18px 18px",
                    }}
                >
                    <SheetTitle>
                        {T("archive_investment_blocked_title")}
                    </SheetTitle>
                    <p
                        style={{
                            fontSize: 13,
                            color: "var(--fg-soft)",
                            margin: 0,
                        }}
                    >
                        {archiveBlockedModal.type === "shares"
                            ? T("archive_investment_shares_blocked_body")
                                  .replace(
                                      "{name}",
                                      archiveBlockedModal.assetName,
                                  )
                                  .replace(
                                      "{shares}",
                                      archiveBlockedModal.shares,
                                  )
                            : T("archive_investment_balance_blocked_body")
                                  .replace(
                                      "{name}",
                                      archiveBlockedModal.assetName,
                                  )
                                  .replace(
                                      "{value}",
                                      archiveBlockedModal.currentValue,
                                  )
                                  .replace(
                                      "{currency}",
                                      archiveBlockedModal.currency,
                                  )}
                    </p>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 6,
                        }}
                    >
                        <button
                            className="btn btn-p"
                            onClick={() => setArchiveBlockedModal(null)}
                        >
                            {T("btn_close")}
                        </button>
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
