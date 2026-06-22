import { useState, useEffect, useCallback } from "react";
import { PageHeader, ToggleSwitch } from "../components/ui";
import {
    AccordionSection,
    SettingsRoot,
    SettingsSectionHeader,
    FireSettingsSection,
    UserSection,
    SharingSection,
} from "./settings/SettingsSections";
import {
    AboutSettingsSection,
    DashboardSettingsSection,
    ExtraSettingsSection,
    GeneralSettingsSection,
    PrivacySettingsSection,
} from "./settings/PreferenceSections";
import {
    DeletePacModal,
    DeleteRecurringModal,
    PacModal,
    RecurringExpenseModal,
} from "./settings/ScheduleModals";
import { SettingsManagementModals } from "./settings/SettingsManagementModals";
import {
    AllocationTargetsSection,
    BudgetSection,
    PacSection,
    RecurringExpensesSection,
} from "./settings/PlanningSections";
import { DataSections } from "./settings/DataSections";
import { CategoryManagementSection } from "./settings/CategoryManagementSection";
import { useSettings } from "../context/useSettings";
import { useContributionSourceManagement } from "./settings/useContributionSourceManagement";
import type {
    InvestmentType,
    RecurringExpense,
    RecurringInvestmentPlan,
} from "../api/types";

type InvTypeContext = "investments" | "account_types";

export default function SettingsView() {
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
        settingsMenu,
        setSettingsMenu,
        showCatAddModal,
        setShowCatAddModal,
        catAddContext,
        catAddError,
        setCatAddError,
        editingCatId,
        demoLoading,
        demoError,
        setDemoError,
        setDemoLoading,
        invTypeError,
        setInvTypeError,
        resetConfirm,
        setResetConfirm,
        resetUnderstood,
        setResetUnderstood,
        resetMsg,
        demoConfirm,
        setDemoConfirm,
        demoUnderstood,
        setDemoUnderstood,
        deleteCatFlow,
        setDeleteCatFlow,
        deleteInvTypeFlow,
        setDeleteInvTypeFlow,
        catForm,
        setCatForm,
        bankAccounts,
        investments,
        settingsNavItems,
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
        resetTransactions,
        resetPortfolio,
        loadDemoData,
        apiFetch,
        fetchFireGoal,
        decimalSeparator,
        profile,
        updateProfile,
        isFeatureEnabled,
        transactionPrefs,
        updateTransactionPreference,
        changePassword,
        deleteAccount,
        logout,
        isDemo,
        viewAs,
    } = useSettings();

    const toggle = useCallback(
        (key: string) => setSettingsMenu((prev) => (prev === key ? null : key)),
        [setSettingsMenu],
    );

    // Drill-down navigation: each page change starts at the top.
    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [settingsMenu]);

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
    useEffect(() => {
        if (
            settingsMenu &&
            !settingsNavItems.some((item) => item.key === settingsMenu)
        ) {
            setSettingsMenu("preferences");
        }
    }, [settingsMenu, settingsNavItems, setSettingsMenu]);

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

    const accordionProps = {
        settingsNavItems,
        settingsMenu,
        onToggle: toggle,
    };

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column" }}>
                {settingsMenu == null ? (
                    <>
                        <PageHeader title={T("tab_settings")} />
                        <SettingsRoot
                            navItems={settingsNavItems}
                            onOpen={(key) => setSettingsMenu(key)}
                            T={T}
                            isDemo={isDemo}
                            viewAs={viewAs}
                            logout={logout}
                        />
                    </>
                ) : (
                    <SettingsSectionHeader
                        label={
                            settingsNavItems.find((i) => i.key === settingsMenu)
                                ?.label || ""
                        }
                        backLabel={T("tab_settings")}
                        onBack={() => setSettingsMenu(null)}
                    />
                )}
                <CategoryManagementSection
                    accordionProps={accordionProps}
                    openNewInvType={openNewInvType}
                    handleEditInvType={handleEditInvType}
                    openNewContributionSource={openNewContributionSource}
                    openEditContributionSource={openEditContributionSource}
                    openDeleteContributionSourceFlow={
                        openDeleteContributionSourceFlow
                    }
                />

                <DataSections accordionProps={accordionProps} />

                {/* ---- Allocation targets section ---- */}
                <AccordionSection sectionKey="allocation" {...accordionProps}>
                    <AllocationTargetsSection />
                </AccordionSection>

                {/* ---- Budget section ---- */}
                <AccordionSection sectionKey="budget" {...accordionProps}>
                    <BudgetSection />
                </AccordionSection>

                {/* ---- Recurring expenses section ---- */}
                <AccordionSection sectionKey="recurring" {...accordionProps}>
                    <RecurringExpensesSection
                        setDeleteRecurringTarget={setDeleteRecurringTarget}
                    />
                </AccordionSection>

                {/* ---- PAC section ---- */}
                <AccordionSection sectionKey="pac" {...accordionProps}>
                    <PacSection setDeletePacTarget={setDeletePacTarget} />
                </AccordionSection>

                {/* ---- Fire settings section ---- */}
                <AccordionSection sectionKey="fire" {...accordionProps}>
                    {
                        <FireSettingsSection
                            T={T}
                            fetchFireGoal={fetchFireGoal}
                        />
                    }
                </AccordionSection>

                {/* ---- Cash Flow preferences section ---- */}
                <AccordionSection
                    sectionKey="cashflow_settings"
                    {...accordionProps}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div className="card" style={{ padding: 16 }}>
                            <ToggleSwitch
                                id="cf-default-verified-toggle"
                                checked={
                                    !!transactionPrefs?.cashflow_default_verified
                                }
                                onChange={(v) =>
                                    updateTransactionPreference(
                                        "cashflow_default_verified",
                                        v,
                                    )
                                }
                                label={T("settings_cf_default_verified")}
                            />
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    marginTop: 8,
                                    lineHeight: 1.35,
                                }}
                            >
                                {T("settings_cf_default_verified_desc")}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 16 }}>
                            <ToggleSwitch
                                id="cf-autofill-account-toggle"
                                checked={
                                    !!transactionPrefs?.cashflow_autofill_last_account
                                }
                                onChange={(v) =>
                                    updateTransactionPreference(
                                        "cashflow_autofill_last_account",
                                        v,
                                    )
                                }
                                label={T("settings_cf_autofill_account")}
                            />
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    marginTop: 8,
                                    lineHeight: 1.35,
                                }}
                            >
                                {T("settings_cf_autofill_account_desc")}
                            </div>
                        </div>
                    </div>
                </AccordionSection>

                {/* ---- Investment preferences section ---- */}
                <AccordionSection
                    sectionKey="investment_settings"
                    {...accordionProps}
                >
                    <div className="card" style={{ padding: 16 }}>
                        <ToggleSwitch
                            id="inv-default-verified-toggle"
                            checked={
                                !!transactionPrefs?.investments_default_verified
                            }
                            onChange={(v) =>
                                updateTransactionPreference(
                                    "investments_default_verified",
                                    v,
                                )
                            }
                            label={T("settings_inv_default_verified")}
                        />
                        <div
                            style={{
                                fontSize: 12,
                                color: "var(--fg-soft)",
                                marginTop: 8,
                                lineHeight: 1.35,
                            }}
                        >
                            {T("settings_inv_default_verified_desc")}
                        </div>
                    </div>
                </AccordionSection>

                {/* ---- User / Account section ---- */}
                <AccordionSection sectionKey="user" {...accordionProps}>
                    <UserSection
                        T={T}
                        profile={profile}
                        updateProfile={updateProfile}
                        changePassword={changePassword}
                        deleteAccount={deleteAccount}
                        isDemo={isDemo}
                        viewAs={viewAs}
                    />
                </AccordionSection>

                {/* ---- Sharing section ---- */}
                <AccordionSection sectionKey="sharing" {...accordionProps}>
                    <div>
                        <div
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                marginBottom: 8,
                            }}
                        >
                            {T("sharing_title")}
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: "var(--fg-soft)",
                                marginBottom: 14,
                            }}
                        >
                            {T("sharing_desc")}
                        </div>
                        <SharingSection T={T} />
                    </div>
                </AccordionSection>

                {/* ---- General section ---- */}
                <AccordionSection sectionKey="general" {...accordionProps}>
                    <GeneralSettingsSection />
                </AccordionSection>

                <AccordionSection sectionKey="privacy" {...accordionProps}>
                    <PrivacySettingsSection />
                </AccordionSection>

                {isFeatureEnabled("dashboard") && (
                    <AccordionSection
                        sectionKey="dashboard"
                        {...accordionProps}
                    >
                        <DashboardSettingsSection />
                    </AccordionSection>
                )}

                <AccordionSection sectionKey="about" {...accordionProps}>
                    <AboutSettingsSection />
                </AccordionSection>

                {/* ---- Extra section ---- */}
                <AccordionSection sectionKey="extra" {...accordionProps}>
                    <ExtraSettingsSection
                        resetMsg={resetMsg}
                        setResetConfirm={setResetConfirm}
                        setResetUnderstood={setResetUnderstood}
                        setDemoConfirm={setDemoConfirm}
                        setDemoUnderstood={setDemoUnderstood}
                    />
                </AccordionSection>
            </div>

            <SettingsManagementModals
                T={T}
                resetConfirm={resetConfirm}
                setResetConfirm={setResetConfirm}
                resetUnderstood={resetUnderstood}
                setResetUnderstood={setResetUnderstood}
                resetTransactions={resetTransactions}
                resetPortfolio={resetPortfolio}
                demoConfirm={demoConfirm}
                setDemoConfirm={setDemoConfirm}
                demoUnderstood={demoUnderstood}
                setDemoUnderstood={setDemoUnderstood}
                demoError={demoError}
                setDemoError={setDemoError}
                demoLoading={demoLoading}
                setDemoLoading={setDemoLoading}
                loadDemoData={loadDemoData}
                showCatAddModal={showCatAddModal}
                setShowCatAddModal={setShowCatAddModal}
                editingCatId={editingCatId}
                catAddContext={catAddContext}
                categories={categories}
                catForm={catForm}
                setCatForm={setCatForm}
                catAddError={catAddError}
                setCatAddError={setCatAddError}
                addCategory={addCategory}
                showInvTypeModal={showInvTypeModal}
                editingInvTypeId={editingInvTypeId}
                invTypeContext={invTypeContext}
                closeInvTypeModal={closeInvTypeModal}
                invTypeForm={invTypeForm}
                setInvTypeForm={setInvTypeForm}
                invTypeError={invTypeError}
                setInvTypeError={setInvTypeError}
                addInvestmentType={addInvestmentType}
                showContributionSourceModal={showContributionSourceModal}
                editingContributionSourceId={editingContributionSourceId}
                closeContributionSourceModal={closeContributionSourceModal}
                contributionSourceForm={contributionSourceForm}
                setContributionSourceForm={setContributionSourceForm}
                contributionSourceError={contributionSourceError}
                setContributionSourceError={setContributionSourceError}
                saveContributionSource={saveContributionSource}
                deleteCatFlow={deleteCatFlow}
                setDeleteCatFlow={setDeleteCatFlow}
                confirmDeleteCategory={confirmDeleteCategory}
                deleteContributionSourceFlow={deleteContributionSourceFlow}
                setDeleteContributionSourceFlow={
                    setDeleteContributionSourceFlow
                }
                contributionSources={contributionSources}
                confirmDeleteContributionSource={
                    confirmDeleteContributionSource
                }
                deleteInvTypeFlow={deleteInvTypeFlow}
                setDeleteInvTypeFlow={setDeleteInvTypeFlow}
                investmentTypes={investmentTypes}
                confirmDeleteInvType={confirmDeleteInvType}
            />

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
        </>
    );
}
