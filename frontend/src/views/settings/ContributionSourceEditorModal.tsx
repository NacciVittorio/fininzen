import type { Dispatch, SetStateAction } from "react";
import Modal from "../../components/Modal";
import FieldLabel from "../../components/FieldLabel";
import type { ContributionSourceForm } from "./useContributionSourceManagement";
import type { EntityId } from "../../context/feedTypes";
import type { Translator } from "../../types";

export function ContributionSourceEditorModal({
    T,
    showContributionSourceModal,
    editingContributionSourceId,
    closeContributionSourceModal,
    contributionSourceForm,
    setContributionSourceForm,
    contributionSourceError,
    setContributionSourceError,
    saveContributionSource,
}: {
    T: Translator;
    showContributionSourceModal: boolean;
    editingContributionSourceId: EntityId | null;
    closeContributionSourceModal: () => void;
    contributionSourceForm: ContributionSourceForm;
    setContributionSourceForm: Dispatch<SetStateAction<ContributionSourceForm>>;
    contributionSourceError: string;
    setContributionSourceError: Dispatch<SetStateAction<string>>;
    saveContributionSource: () => void;
}) {
    return (
        <>
            {showContributionSourceModal && (
                <Modal
                    title={
                        editingContributionSourceId
                            ? T("modal_edit_contribution_source")
                            : T("modal_add_contribution_source")
                    }
                    onClose={closeContributionSourceModal}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <input
                            className="inp"
                            placeholder={T(
                                "placeholder_contribution_source_name",
                            )}
                            value={contributionSourceForm.name}
                            onChange={(e) => {
                                setContributionSourceForm((p) => ({
                                    ...p,
                                    name: e.target.value,
                                }));
                                setContributionSourceError("");
                            }}
                            style={{
                                borderColor: contributionSourceError
                                    ? "var(--danger)"
                                    : undefined,
                            }}
                            autoFocus
                        />
                        <div>
                            <FieldLabel text={T("sort_order")} />
                            <input
                                className="inp"
                                type="number"
                                min="0"
                                step="1"
                                value={contributionSourceForm.sort_order}
                                onChange={(e) =>
                                    setContributionSourceForm((p) => ({
                                        ...p,
                                        sort_order: e.target.value,
                                    }))
                                }
                            />
                        </div>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                fontSize: 13,
                                color: "var(--fg)",
                                background: "var(--card-inset)",
                                borderRadius: 10,
                                padding: "10px 14px",
                                border: "1px solid var(--rule)",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={contributionSourceForm.is_active}
                                onChange={(e) =>
                                    setContributionSourceForm((p) => ({
                                        ...p,
                                        is_active: e.target.checked,
                                    }))
                                }
                            />
                            {T("active")}
                        </label>
                        {contributionSourceError && (
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--danger)",
                                    marginTop: -6,
                                }}
                            >
                                {contributionSourceError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 4,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={closeContributionSourceModal}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                onClick={saveContributionSource}
                            >
                                {editingContributionSourceId
                                    ? T("btn_save")
                                    : T("btn_add")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
