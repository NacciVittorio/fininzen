"use client";

import type { Dispatch, SetStateAction } from "react";
import Modal from "../../components/Modal";
import type { Category } from "../../api/types";
import type {
    CatForm,
    CategoryAddContext,
} from "../../context/useAppProviderState";
import type { EntityId } from "../../context/feedTypes";
import type { Translator } from "../../types";

export function CategoryEditorModal({
    T,
    showCatAddModal,
    setShowCatAddModal,
    editingCatId,
    catAddContext,
    categories,
    catForm,
    setCatForm,
    catAddError,
    setCatAddError,
    addCategory,
}: {
    T: Translator;
    showCatAddModal: boolean;
    setShowCatAddModal: Dispatch<SetStateAction<boolean>>;
    editingCatId: EntityId | null;
    catAddContext: CategoryAddContext;
    categories: readonly Category[];
    catForm: CatForm;
    setCatForm: Dispatch<SetStateAction<CatForm>>;
    catAddError: string;
    setCatAddError: Dispatch<SetStateAction<string>>;
    addCategory: () => void;
}) {
    return (
        <>
            {showCatAddModal && (
                <Modal
                    title={
                        editingCatId
                            ? T("modal_edit_category")
                            : catAddContext.parent
                              ? T("modal_add_subcategory")
                              : catAddContext.type === "expense"
                                ? T("add_expense_cat")
                                : T("add_income_cat")
                    }
                    onClose={() => {
                        setShowCatAddModal(false);
                        setCatAddError("");
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        {!editingCatId &&
                            catAddContext.parent &&
                            (() => {
                                const parent = categories.find(
                                    (c) => c.id === catAddContext.parent,
                                );
                                return (
                                    <div
                                        style={{
                                            background: "var(--card-inset)",
                                            borderRadius: 9,
                                            padding: "9px 14px",
                                            fontSize: 12,
                                            color: "var(--fg-soft)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <span>{T("under_label")}</span>
                                        <div
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: "50%",
                                                background: parent?.color,
                                            }}
                                        />
                                        <span style={{ color: "var(--fg)" }}>
                                            {parent?.icon} {parent?.name}
                                        </span>
                                    </div>
                                );
                            })()}

                        <input
                            className="inp"
                            placeholder={T("placeholder_cat_name")}
                            value={catForm.name}
                            onChange={(e) => {
                                setCatForm((p) => ({
                                    ...p,
                                    name: e.target.value,
                                }));
                                setCatAddError("");
                            }}
                            style={{
                                borderColor: catAddError
                                    ? "var(--danger)"
                                    : undefined,
                            }}
                            autoFocus
                        />
                        {catAddError && (
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--danger)",
                                    marginTop: -6,
                                }}
                            >
                                {catAddError}
                            </div>
                        )}
                        <div className="row">
                            <input
                                className="inp"
                                placeholder={T("placeholder_icon")}
                                value={catForm.icon}
                                onChange={(e) =>
                                    setCatForm((p) => ({
                                        ...p,
                                        icon: e.target.value,
                                    }))
                                }
                            />
                            <input
                                type="color"
                                value={catForm.color}
                                onChange={(e) =>
                                    setCatForm((p) => ({
                                        ...p,
                                        color: e.target.value,
                                    }))
                                }
                                style={{
                                    width: 48,
                                    height: 42,
                                    borderRadius: 10,
                                    border: "1px solid var(--rule)",
                                    background: "var(--card-inset)",
                                    cursor: "pointer",
                                    padding: 4,
                                    flexShrink: 0,
                                }}
                            />
                        </div>
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
                                onClick={() => setShowCatAddModal(false)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button className="btn btn-p" onClick={addCategory}>
                                {editingCatId ? T("btn_save") : T("btn_add")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
