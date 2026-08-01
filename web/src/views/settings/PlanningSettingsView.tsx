"use client";

import { useState } from "react";
import type {
    InvestmentType,
    RecurringExpense,
    RecurringInvestmentPlan,
} from "../../api/types";
import { useSettings } from "../../context/useSettings";
import { useContributionSourceManagement } from "./useContributionSourceManagement";
import { CategoryManagementSection } from "./CategoryManagementSection";
import { CategoryModals } from "./CategoryModals";
import { ContributionSourceModals } from "./ContributionSourceModals";
import { InvestmentTypeModals } from "./InvestmentTypeModals";
import { SettingsSectionHeader } from "./SettingsNavigation";
import { SettingsRow } from "./SettingsRow";
import {
    AllocationTargetsSection,
    BudgetSection,
    PacSection,
    RecurringExpensesSection,
} from "./PlanningSections";
import { FireSettingsSection } from "./FireSettingsSection";
import {
    DeletePacModal,
    DeleteRecurringModal,
    PacModal,
    RecurringExpenseModal,
} from "./ScheduleModals";

type InvTypeContext = "investments" | "account_types";
type PlanningKey =
    "categories" | "budget" | "recurring" | "pac" | "allocation" | "fire";

export default function PlanningSettingsView() {
    const {
        T,
        MONTHS,
        categories,
        investmentTypes,
        contributionSources,
        showInvTypeModal,
        setShowInvTypeModal,
        invTypeForm,
        setInvTypeForm,
        showRecurringModal,
        editingRecurringId,
        recurringForm,
        setRecurringForm,
        recurringError,
        recurringSaving,
        showPacModal,
        editingPacId,
        pacForm,
        setPacForm,
        pacError,
        pacSaving,
        showCatAddModal,
        setShowCatAddModal,
        catAddContext,
        catAddError,
        setCatAddError,
        editingCatId,
        invTypeError,
        setInvTypeError,
        deleteCatFlow,
        setDeleteCatFlow,
        deleteInvTypeFlow,
        setDeleteInvTypeFlow,
        catForm,
        setCatForm,
        bankAccounts,
        investments,
        fetchContributionSources,
        refreshAfter,
        closeRecurringModal,
        submitRecurring,
        deleteRecurring,
        closePacModal,
        submitPac,
        deletePac,
        addCategory,
        confirmDeleteCategory,
        editingInvTypeId,
        addInvestmentType,
        confirmDeleteInvType,
        openEditInvType,
        closeInvTypeModal,
        apiFetch,
        decimalSeparator,
        isFeatureEnabled,
        isDemo,
        fetchFireGoal,
    } = useSettings();

    const [planningMenu, setPlanningMenu] = useState<PlanningKey | null>(null);
    const [invTypeContext, setInvTypeContext] =
        useState<InvTypeContext>("investments");
    const [deleteRecurringTarget, setDeleteRecurringTarget] =
        useState<RecurringExpense | null>(null);
    const [deletePacTarget, setDeletePacTarget] =
        useState<RecurringInvestmentPlan | null>(null);

    const {
        showContributionSourceModal,
        editingContributionSourceId,
        contributionSourceForm,
        setContributionSourceForm,
        contributionSourceError,
        setContributionSourceError,
        deleteContributionSourceFlow,
        setDeleteContributionSourceFlow,
        openNewContributionSource,
        openEditContributionSource,
        closeContributionSourceModal,
        saveContributionSource,
        openDeleteContributionSourceFlow,
        confirmDeleteContributionSource,
    } = useContributionSourceManagement({
        T,
        apiFetch,
        contributionSources,
        fetchContributionSources,
        isDemo,
        refreshAfter,
    });

    const openNewInvType = (context: InvTypeContext) => {
        setInvTypeContext(context);
        setInvTypeForm((p) => ({
            ...p,
            is_bank_account: context === "account_types",
            supports_contribution_source: false,
        }));
        setShowInvTypeModal(true);
    };

    const handleEditInvType = (invType: InvestmentType) => {
        setInvTypeContext(
            invType.is_bank_account ? "account_types" : "investments",
        );
        openEditInvType(invType);
    };

    const hasConfigurableDataFeatures =
        isFeatureEnabled("cashflow") ||
        isFeatureEnabled("accounts") ||
        isFeatureEnabled("investments");

    const items: { key: PlanningKey; icon: string; label: string }[] = [
        hasConfigurableDataFeatures && {
            key: "categories",
            icon: "📂",
            label: T("settings_categories"),
        },
        isFeatureEnabled("cashflow") && {
            key: "budget",
            icon: "🎯",
            label: T("settings_budget"),
        },
        isFeatureEnabled("cashflow") && {
            key: "recurring",
            icon: "🔄",
            label: T("settings_recurring"),
        },
        isFeatureEnabled("investments") && {
            key: "pac",
            icon: "📆",
            label: T("settings_pac"),
        },
        isFeatureEnabled("investments") && {
            key: "allocation",
            icon: "📊",
            label: T("settings_allocation"),
        },
        isFeatureEnabled("fire") && {
            key: "fire",
            icon: "🔥",
            label: T("settings_fire"),
        },
    ].filter(
        (item): item is { key: PlanningKey; icon: string; label: string } =>
            Boolean(item),
    );

    const modalProps = {
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
        showInvTypeModal,
        editingInvTypeId,
        invTypeContext,
        closeInvTypeModal,
        invTypeForm,
        setInvTypeForm,
        invTypeError,
        setInvTypeError,
        addInvestmentType,
        showContributionSourceModal,
        editingContributionSourceId,
        closeContributionSourceModal,
        contributionSourceForm,
        setContributionSourceForm,
        contributionSourceError,
        setContributionSourceError,
        saveContributionSource,
        deleteCatFlow,
        setDeleteCatFlow,
        confirmDeleteCategory,
        deleteContributionSourceFlow,
        setDeleteContributionSourceFlow,
        contributionSources,
        confirmDeleteContributionSource,
        deleteInvTypeFlow,
        setDeleteInvTypeFlow,
        investmentTypes,
        confirmDeleteInvType,
    };

    const activeItem = items.find((item) => item.key === planningMenu);

    return (
        <div className="page-narrow">
            {!activeItem ? (
                <>
                    <SettingsSectionHeader
                        label={T("settings_planning")}
                        backLabel={T("tab_settings")}
                        backHref="/settings"
                    />
                    <div className="grouped-list">
                        {items.map((item) => (
                            <SettingsRow
                                key={item.key}
                                label={
                                    <span
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                        }}
                                    >
                                        <span style={{ fontSize: 17 }}>
                                            {item.icon}
                                        </span>
                                        {item.label}
                                    </span>
                                }
                                trailing={
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            color: "var(--fg-faint)",
                                            fontSize: 17,
                                        }}
                                    >
                                        ›
                                    </span>
                                }
                                onClick={() => setPlanningMenu(item.key)}
                                testId={`planning-root-${item.key}`}
                            />
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <SettingsSectionHeader
                        label={activeItem.label}
                        backLabel={T("settings_planning")}
                        onBack={() => setPlanningMenu(null)}
                    />
                    {activeItem.key === "categories" && (
                        <CategoryManagementSection
                            openNewInvType={openNewInvType}
                            handleEditInvType={handleEditInvType}
                            openNewContributionSource={
                                openNewContributionSource
                            }
                            openEditContributionSource={
                                openEditContributionSource
                            }
                            openDeleteContributionSourceFlow={
                                openDeleteContributionSourceFlow
                            }
                        />
                    )}
                    {activeItem.key === "budget" && <BudgetSection />}
                    {activeItem.key === "recurring" && (
                        <RecurringExpensesSection
                            setDeleteRecurringTarget={setDeleteRecurringTarget}
                        />
                    )}
                    {activeItem.key === "pac" && (
                        <PacSection setDeletePacTarget={setDeletePacTarget} />
                    )}
                    {activeItem.key === "allocation" && (
                        <AllocationTargetsSection />
                    )}
                    {activeItem.key === "fire" && (
                        <FireSettingsSection
                            T={T}
                            fetchFireGoal={fetchFireGoal}
                        />
                    )}
                </>
            )}

            <CategoryModals {...modalProps} />
            <InvestmentTypeModals {...modalProps} />
            <ContributionSourceModals {...modalProps} />

            {showRecurringModal && (
                <RecurringExpenseModal
                    T={T}
                    MONTHS={MONTHS}
                    categories={categories}
                    bankAccounts={bankAccounts}
                    decimalSeparator={decimalSeparator}
                    editingRecurringId={editingRecurringId}
                    recurringForm={recurringForm}
                    setRecurringForm={setRecurringForm}
                    recurringError={recurringError}
                    recurringSaving={recurringSaving}
                    closeRecurringModal={closeRecurringModal}
                    submitRecurring={submitRecurring}
                />
            )}
            {showPacModal && (
                <PacModal
                    T={T}
                    MONTHS={MONTHS}
                    investments={investments}
                    bankAccounts={bankAccounts}
                    decimalSeparator={decimalSeparator}
                    editingPacId={editingPacId}
                    pacForm={pacForm}
                    setPacForm={setPacForm}
                    pacError={pacError}
                    pacSaving={pacSaving}
                    closePacModal={closePacModal}
                    submitPac={submitPac}
                />
            )}
            {deleteRecurringTarget && (
                <DeleteRecurringModal
                    T={T}
                    target={deleteRecurringTarget}
                    saving={recurringSaving}
                    onClose={() => setDeleteRecurringTarget(null)}
                    deleteRecurring={deleteRecurring}
                />
            )}
            {deletePacTarget && (
                <DeletePacModal
                    T={T}
                    target={deletePacTarget}
                    saving={pacSaving}
                    onClose={() => setDeletePacTarget(null)}
                    deletePac={deletePac}
                />
            )}
        </div>
    );
}
