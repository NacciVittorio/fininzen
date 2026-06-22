import type { Dispatch, SetStateAction } from "react";
import Modal from "../../components/Modal";
import { DeleteCategorySubcategoriesStep } from "./DeleteCategorySubcategoriesStep";
import { DeleteCategoryTransactionsStep } from "./DeleteCategoryTransactionsStep";
import type { Category } from "../../api/types";
import type { DeleteCategoryFlow } from "../../context/useAppProviderState";
import type { Translator } from "../../types";

export function DeleteCategoryModal({
    T,
    deleteCatFlow,
    setDeleteCatFlow,
    categories,
    confirmDeleteCategory,
}: {
    T: Translator;
    deleteCatFlow: DeleteCategoryFlow | null;
    setDeleteCatFlow: Dispatch<SetStateAction<DeleteCategoryFlow | null>>;
    categories: readonly Category[];
    confirmDeleteCategory: () => void;
}) {
    if (!deleteCatFlow) return null;

    return (
        <Modal
            title={T("modal_delete_category")}
            onClose={() => setDeleteCatFlow(null)}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                }}
            >
                <div
                    style={{
                        background: "var(--card-inset)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: `${deleteCatFlow.cat.color}22`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            flexShrink: 0,
                        }}
                    >
                        {deleteCatFlow.cat.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {deleteCatFlow.cat.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                            {deleteCatFlow.cat.expense_count || 0}{" "}
                            {T("transactions")}
                        </div>
                    </div>
                </div>

                <DeleteCategorySubcategoriesStep
                    T={T}
                    deleteCatFlow={deleteCatFlow}
                    setDeleteCatFlow={setDeleteCatFlow}
                    categories={categories}
                />
                <DeleteCategoryTransactionsStep
                    T={T}
                    deleteCatFlow={deleteCatFlow}
                    setDeleteCatFlow={setDeleteCatFlow}
                    categories={categories}
                    confirmDeleteCategory={confirmDeleteCategory}
                />
            </div>
        </Modal>
    );
}
