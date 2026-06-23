import { API } from "../utils/api";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import type { ApiFetcher } from "../api/client";
import type { Category, InvestmentType } from "../api/types";
import type { Translator } from "../types";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";

type CatalogActionState = Pick<
    AppProviderState,
    | "catAddContext"
    | "categories"
    | "catForm"
    | "deleteCatFlow"
    | "deleteInvTypeFlow"
    | "editingCatId"
    | "editingInvTypeId"
    | "editingInvTypeOrigRateRef"
    | "invTypeForm"
    | "setCatAddContext"
    | "setCatAddError"
    | "setCatForm"
    | "setDeleteCatFlow"
    | "setDeleteInvTypeFlow"
    | "setEditingCatId"
    | "setEditingInvTypeId"
    | "setExpandedCats"
    | "setInvTypeError"
    | "setInvTypeForm"
    | "setShowCatAddModal"
    | "setShowInvTypeModal"
    | "setTaxPropagationFlow"
>;

export type CatalogActionsOptions = CatalogActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
    refreshAfter: (reason: RefreshReason) => unknown;
};

type CategoryType = "expense" | "income";

export function useCatalogActions({
    apiFetch,
    catAddContext,
    categories,
    catForm,
    deleteCatFlow,
    deleteInvTypeFlow,
    editingCatId,
    editingInvTypeId,
    editingInvTypeOrigRateRef,
    guardDemo,
    invTypeForm,
    refreshAfter,
    setCatAddContext,
    setCatAddError,
    setCatForm,
    setDeleteCatFlow,
    setDeleteInvTypeFlow,
    setEditingCatId,
    setEditingInvTypeId,
    setExpandedCats,
    setInvTypeError,
    setInvTypeForm,
    setShowCatAddModal,
    setShowInvTypeModal,
    setTaxPropagationFlow,
    T,
}: CatalogActionsOptions) {
    // ── Category actions ──

    const addCategory = async () => {
        if (guardDemo()) return;
        if (!catForm.name.trim()) {
            setCatAddError(T("error_name_required"));
            return;
        }
        setCatAddError("");
        try {
            const isEdit = editingCatId !== null;
            const url = isEdit
                ? `${API}/expenses/categories/${editingCatId}/`
                : `${API}/expenses/categories/`;
            const body = isEdit
                ? {
                      name: catForm.name.trim(),
                      color: catForm.color,
                      icon: catForm.icon,
                  }
                : {
                      name: catForm.name.trim(),
                      color: catForm.color,
                      icon: catForm.icon,
                      category_type: catAddContext.type,
                      parent: catAddContext.parent,
                  };
            const res = await apiFetch(url, {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                setCatAddError(T("error_save_failed"));
                return;
            }
            setShowCatAddModal(false);
            setEditingCatId(null);
            setCatForm({ name: "", color: "#4f7fff", icon: "💰" });
            refreshAfter(
                editingCatId !== null
                    ? REFRESH_REASONS.CATEGORY_UPDATED
                    : REFRESH_REASONS.CATEGORY_CREATED,
            );
        } catch {
            setCatAddError(T("error_network"));
        }
    };

    const openDeleteCatFlow = (cat: Category): void => {
        const isRoot = !cat.parent;
        const subs = categories.filter((c) => c.parent === cat.id);
        if (isRoot && subs.length > 0) {
            setDeleteCatFlow({
                cat,
                step: "subs",
                subsChoice: null,
                subsTarget: null,
                expChoice: null,
                expTarget: null,
            });
        } else {
            setDeleteCatFlow({
                cat,
                step: "expenses",
                subsChoice: null,
                subsTarget: null,
                expChoice: null,
                expTarget: null,
            });
        }
    };

    const confirmDeleteCategory = async () => {
        if (!deleteCatFlow) return;
        const { cat, subsChoice, subsTarget, expChoice, expTarget } =
            deleteCatFlow;
        await apiFetch(`${API}/expenses/categories/${cat.id}/`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subs_action: subsChoice || "null",
                reassign_subs_to: subsTarget || null,
                expenses_action: expChoice || "null",
                reassign_expenses_to: expTarget || null,
            }),
        });
        setDeleteCatFlow(null);
        refreshAfter(REFRESH_REASONS.CATEGORY_DELETED);
    };

    const openAddMain = (type: CategoryType): void => {
        setEditingCatId(null);
        setCatAddContext({ type, parent: null });
        setCatForm({ name: "", color: "#4f7fff", icon: "💰" });
        setCatAddError("");
        setShowCatAddModal(true);
    };
    const openAddSub = (parentCat: Category): void => {
        setEditingCatId(null);
        setCatAddContext({
            type: parentCat.category_type ?? "expense",
            parent: parentCat.id,
        });
        setCatForm({
            name: "",
            color: parentCat.color ?? "#4f7fff",
            icon: parentCat.icon ?? "💰",
        });
        setCatAddError("");
        setShowCatAddModal(true);
    };
    const openEditCat = (cat: Category): void => {
        setEditingCatId(cat.id);
        setCatAddContext({
            type: cat.category_type ?? "expense",
            parent: cat.parent || null,
        });
        setCatForm({
            name: cat.name,
            color: cat.color ?? "#4f7fff",
            icon: cat.icon ?? "💰",
        });
        setCatAddError("");
        setShowCatAddModal(true);
    };
    const toggleExpandCat = (catId: number | string): void => {
        setExpandedCats((prev) => {
            const n = new Set(prev);
            if (n.has(catId)) n.delete(catId);
            else n.add(catId);
            return n;
        });
    };

    // ── Investment type actions ──

    const closeInvTypeModal = () => {
        setShowInvTypeModal(false);
        setEditingInvTypeId(null);
        editingInvTypeOrigRateRef.current = null;
        setInvTypeForm({
            name: "",
            color: "#4f7fff",
            icon: "📈",
            supports_ticker: true,
            is_liquid_default: true,
            is_bank_account: false,
            supports_contribution_source: false,
            tax_rate: "0",
        });
        setInvTypeError("");
    };

    const openEditInvType = (invType: InvestmentType): void => {
        setEditingInvTypeId(invType.id);
        editingInvTypeOrigRateRef.current = Number(invType.tax_rate || 0);
        setInvTypeForm({
            name: invType.name,
            color: invType.color ?? "#4f7fff",
            icon: invType.icon ?? "📈",
            supports_ticker: invType.supports_ticker ?? true,
            is_liquid_default: invType.is_liquid_default ?? true,
            is_bank_account: !!invType.is_bank_account,
            supports_contribution_source:
                !!invType.supports_contribution_source,
            tax_rate: String(
                (
                    Number.parseFloat(String(invType.tax_rate || 0)) * 100
                ).toFixed(2),
            ).replace(/\.00$/, ""),
        });
        setInvTypeError("");
        setShowInvTypeModal(true);
    };

    const addInvestmentType = async () => {
        if (guardDemo()) return;
        if (!invTypeForm.name.trim()) {
            setInvTypeError(T("error_name_required"));
            return;
        }
        setInvTypeError("");
        const isEdit = editingInvTypeId !== null;
        const body = {
            ...invTypeForm,
            name: invTypeForm.name.trim(),
            tax_rate: (
                Number.parseFloat(invTypeForm.tax_rate || "0") / 100
            ).toFixed(4),
        };

        const doSave = async (
            propagation: "all" | "forward" | null,
        ): Promise<boolean> => {
            const finalBody =
                propagation && isEdit
                    ? { ...body, tax_propagation: propagation }
                    : body;
            try {
                const url = isEdit
                    ? `${API}/portfolio/investment-types/${editingInvTypeId}/`
                    : `${API}/portfolio/investment-types/`;
                const res = await apiFetch(url, {
                    method: isEdit ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(finalBody),
                });
                if (!res.ok) {
                    setInvTypeError(T("error_save_failed"));
                    return false;
                }
            } catch {
                setInvTypeError(T("error_network"));
                return false;
            }
            closeInvTypeModal();
            refreshAfter(
                isEdit
                    ? REFRESH_REASONS.INVESTMENT_TYPE_UPDATED
                    : REFRESH_REASONS.INVESTMENT_TYPE_CREATED,
            );
            return true;
        };

        // If an existing type's tax rate changed, offer to propagate it to the
        // already-created sells of its assets (those without their own override).
        const newRate = Number(body.tax_rate);
        const taxChanged =
            isEdit && newRate !== editingInvTypeOrigRateRef.current;
        if (taxChanged) {
            setTaxPropagationFlow({
                kind: "invtype",
                run: async (propagation) => {
                    const ok = await doSave(propagation);
                    setTaxPropagationFlow(null);
                    return ok;
                },
            });
            return;
        }
        await doSave(null);
    };

    const openDeleteInvTypeFlow = (invType: InvestmentType): void =>
        setDeleteInvTypeFlow({
            invType,
            assetsChoice: null,
            assetsTarget: null,
        });

    const confirmDeleteInvType = async () => {
        if (!deleteInvTypeFlow) return;
        const { invType, assetsChoice, assetsTarget } = deleteInvTypeFlow;
        await apiFetch(`${API}/portfolio/investment-types/${invType.id}/`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assets_action: assetsChoice || "null",
                reassign_to: assetsTarget || null,
            }),
        });
        setDeleteInvTypeFlow(null);
        refreshAfter(REFRESH_REASONS.INVESTMENT_TYPE_DELETED);
    };

    return {
        addCategory,
        openDeleteCatFlow,
        confirmDeleteCategory,
        openAddMain,
        openAddSub,
        openEditCat,
        toggleExpandCat,
        addInvestmentType,
        openDeleteInvTypeFlow,
        confirmDeleteInvType,
        openEditInvType,
        closeInvTypeModal,
    };
}
