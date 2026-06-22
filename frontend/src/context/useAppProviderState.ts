import { useRef, useState } from "react";
import type {
    Asset,
    Budget,
    Category,
    Expense,
    InvestmentType,
    RecurringExpense,
    RecurringInvestmentPlan,
} from "../api/types";
import type {
    CashflowTrendPoint,
    ExpenseSummaryResponse,
    RecurringStatusResponse,
} from "../api/expenses";
import type {
    PortfolioHistoryPoint,
    PortfolioSummaryResponse,
} from "../api/portfolio";
import type { ContributionSource } from "../api/contributionSources";
import type { AllocationTargetRow } from "../utils/allocationGroups";
import type { CashflowDirection } from "../utils/directionFilter";
import { currentMonth, currentYear } from "../utils/formatters";
import {
    buildExpenseForm,
    buildPacForm,
    buildRecurringForm,
    buildTransferForm,
} from "./formBuilders";
import {
    cloneDashConfig,
    mergeDashConfig,
    normalizeMonthlyOverviewPrefs,
    normalizeWealthMetrics,
} from "./appContextHelpers";
import type {
    DashboardSection,
    MonthlyOverviewPreferences,
    WealthMetric,
    WealthTimeRange,
} from "./appContextHelpers";
import type {
    ExpenseForm,
    PacForm,
    RecurringForm,
    TransferForm,
} from "./formBuilders";

type EntityId = number | string;
type DataObject = Record<string, unknown>;
type ViewMode = "month" | "year";
type ModalDirection = "expense" | "income" | "transfer";
type AllocationChartType = "bar" | "pie";
type SettingsCategoryType = "expense" | "income";
type ContributionSourceMode = "inherit" | "enabled" | "disabled";

export type InvestmentTypeForm = {
    name: string;
    color: string;
    icon: string;
    supports_ticker: boolean;
    is_liquid_default: boolean;
    is_bank_account: boolean;
    supports_contribution_source: boolean;
    tax_rate: string;
};

export type AssetForm = {
    name: string;
    ticker: string;
    price_source: string;
    source_symbol: string;
    source_url: string;
    isin: string;
    investment_type: EntityId;
    tracking_type: string;
    initial_balance: string;
    tax_rate_override: string;
    notes: string;
    source_account: string;
    contribution_source_mode: ContributionSourceMode;
    contribution_source_ids: EntityId[];
};

type CategoryAddContext = {
    type: SettingsCategoryType;
    parent: EntityId | null;
};

export type DeleteCategoryFlow = {
    cat: Category;
    step: "subs" | "expenses";
    subsChoice: string | null;
    subsTarget: EntityId | null;
    expChoice: string | null;
    expTarget: EntityId | null;
};

export type DeleteInvestmentTypeFlow = {
    invType: InvestmentType;
    assetsChoice: string | null;
    assetsTarget: EntityId | null;
};

type TaxPropagationFlow = {
    kind: "asset" | "invtype";
    run: (propagation: "all" | "forward") => Promise<unknown>;
};

type ResetTarget = "transactions" | "portfolio";
type ResetResult = { deleted: number; target: ResetTarget };

export function useAppProviderState() {
    // Dashboard config — layout (order + visibility) synced server-side via the
    // profile (applyProfileData). localStorage is a cache/fallback for offline
    // and pre-auth render.
    const [dashConfig, setDashConfig] = useState<DashboardSection[]>(() => {
        try {
            const merged = mergeDashConfig(
                JSON.parse(localStorage.getItem("dashConfig") || "null"),
            );
            if (merged) {
                localStorage.setItem("dashConfig", JSON.stringify(merged));
                return merged;
            }
        } catch {
            // Ignore invalid local cache and restore the canonical configuration.
        }
        return cloneDashConfig();
    });
    const [showDashSettings, setShowDashSettings] = useState(false);

    // Data
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [trendExpenses, setTrendExpenses] = useState<CashflowTrendPoint[]>(
        [],
    );
    const [trendIncomes, setTrendIncomes] = useState<CashflowTrendPoint[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [summary, setSummary] = useState<PortfolioSummaryResponse | null>(
        null,
    );
    const [expSummary, setExpSummary] = useState<ExpenseSummaryResponse | null>(
        null,
    );
    const [recurringStatus, setRecurringStatus] =
        useState<RecurringStatusResponse | null>(null);
    // Always for the current calendar month — drives Dashboard widgets that
    // shouldn't follow the Cash Flow tab's filterMonth.
    const [expSummaryCurrentMonth, setExpSummaryCurrentMonth] =
        useState<ExpenseSummaryResponse>({
            total: 0,
            by_category: [],
        });

    const [monthlyInvestmentStats, setMonthlyInvestmentStats] =
        useState<DataObject | null>(null);
    // Mese/anno dedicati alla card statistiche investimenti (tab Investimenti):
    // navigano indipendentemente dal filterMonth del Cash Flow.
    const [invStatsMonth, setInvStatsMonth] = useState(currentMonth);
    const [invStatsYear, setInvStatsYear] = useState(currentYear);

    // Investment types
    const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>(
        [],
    );
    const [contributionSources, setContributionSources] = useState<
        ContributionSource[]
    >([]);
    const [showInvTypeModal, setShowInvTypeModal] = useState(false);
    const [invTypeForm, setInvTypeForm] = useState<InvestmentTypeForm>({
        name: "",
        color: "#4f7fff",
        icon: "📈",
        supports_ticker: true,
        is_liquid_default: true,
        is_bank_account: false,
        supports_contribution_source: false,
        tax_rate: "0",
    });
    const [editingInvTypeId, setEditingInvTypeId] = useState<EntityId | null>(
        null,
    );

    // Allocation
    const [allocationData, setAllocationData] = useState<AllocationTargetRow[]>(
        [],
    );

    // Budgets
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [editingBudgetCat, setEditingBudgetCat] = useState<EntityId | null>(
        null,
    );
    const [budgetInputVal, setBudgetInputVal] = useState("");

    // Recurring
    const [recurringExpenses, setRecurringExpenses] = useState<
        RecurringExpense[]
    >([]);
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [editingRecurringId, setEditingRecurringId] =
        useState<EntityId | null>(null);
    const [recurringForm, setRecurringForm] = useState<RecurringForm>(() =>
        buildRecurringForm(),
    );
    const [recurringError, setRecurringError] = useState<string | null>(null);
    const [recurringSaving, setRecurringSaving] = useState(false);
    const [generateRecurringMsg, setGenerateRecurringMsg] =
        useState<DataObject | null>(null);
    const [recurringInvestmentPlans, setRecurringInvestmentPlans] = useState<
        RecurringInvestmentPlan[]
    >([]);
    const [showPacModal, setShowPacModal] = useState(false);
    const [editingPacId, setEditingPacId] = useState<EntityId | null>(null);
    const [pacForm, setPacForm] = useState<PacForm>(() => buildPacForm());
    const [pacError, setPacError] = useState<string | null>(null);
    const [pacSaving, setPacSaving] = useState(false);
    const [generatePacMsg, setGeneratePacMsg] = useState<DataObject | null>(
        null,
    );
    // Expense filters
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterCat, setFilterCat] = useState<EntityId[]>([]);
    const [filterAccount, setFilterAccount] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>("month");
    const [cashflowDir, setCashflowDir] =
        useState<CashflowDirection>("expense");
    const [filterVerified, setFilterVerified] = useState<boolean | null>(null);

    // Global loading / error
    const [appLoading, setAppLoading] = useState(true);
    const [bootstrapReady, setBootstrapReady] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // UI state
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
    const [priceRefreshCounter, setPriceRefreshCounter] = useState(0);
    const [showExpModal, setShowExpModal] = useState(false);
    const [editingExpenseId, setEditingExpenseId] = useState<EntityId | null>(
        null,
    );
    const [expError, setExpError] = useState<string | null>(null);
    const [modalDir, setModalDir] = useState<ModalDirection>("expense");
    const [pieHover, setPieHover] = useState<number | null>(null);
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [editingAssetId, setEditingAssetId] = useState<EntityId | null>(null);
    const [assetError, setAssetError] = useState<string | null>(null);
    const [assetSaving, setAssetSaving] = useState(false);
    const [allocChartType, setAllocChartType] =
        useState<AllocationChartType>("bar");

    // Settings state
    const [settingsCatType, setSettingsCatType] =
        useState<SettingsCategoryType>("expense");
    const [settingsMenu, setSettingsMenu] = useState<string | null>(null);
    const [showCatAddModal, setShowCatAddModal] = useState(false);
    const [catAddContext, setCatAddContext] = useState<CategoryAddContext>({
        type: "expense",
        parent: null,
    });
    const [editingCatId, setEditingCatId] = useState<EntityId | null>(null);
    const [catAddError, setCatAddError] = useState("");
    const [demoLoading, setDemoLoading] = useState(false);
    const [demoError, setDemoError] = useState("");
    const [invTypeError, setInvTypeError] = useState("");

    // Accordion
    const [expandedCats, setExpandedCats] = useState<Set<EntityId>>(new Set());

    // Delete flows
    const [deleteExpenseTarget, setDeleteExpenseTarget] =
        useState<Expense | null>(null);
    const [resetConfirm, setResetConfirm] = useState<ResetTarget | null>(null);
    const [resetUnderstood, setResetUnderstood] = useState(false);
    const [resetMsg, setResetMsg] = useState<ResetResult | null>(null);
    const [demoConfirm, setDemoConfirm] = useState(false);
    const [demoUnderstood, setDemoUnderstood] = useState(false);
    const [deleteCatFlow, setDeleteCatFlow] =
        useState<DeleteCategoryFlow | null>(null);
    const [deleteInvTypeFlow, setDeleteInvTypeFlow] =
        useState<DeleteInvestmentTypeFlow | null>(null);
    // Choice popup shown when a tax-rate change (asset override or investment type)
    // could affect existing sells. Shape: { kind: 'asset'|'invtype', run: (propagation)=>Promise }.
    // run("all") propagates the new rate to existing auto sells; run("forward")
    // applies it only to future transactions.
    const [taxPropagationFlow, setTaxPropagationFlow] =
        useState<TaxPropagationFlow | null>(null);
    // Original effective tax rates captured at modal-open, to detect a change on save.
    const editingAssetOrigOverrideRef = useRef<number | null>(null);
    const editingInvTypeOrigRateRef = useRef<number | null>(null);

    // Transfer modal
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferForm, setTransferForm] = useState<TransferForm>(() =>
        buildTransferForm(),
    );
    const [transferWarning, setTransferWarning] = useState<string | null>(null);
    const [transferError, setTransferError] = useState<string | null>(null);
    const [transferLoading, setTransferLoading] = useState(false);

    // Forms
    const [expForm, setExpForm] = useState<ExpenseForm>(() =>
        buildExpenseForm(),
    );
    const [assetForm, setAssetForm] = useState<AssetForm>({
        name: "",
        ticker: "",
        price_source: "AUTO",
        source_symbol: "",
        source_url: "",
        isin: "",
        investment_type: "",
        tracking_type: "AUTO",
        initial_balance: "",
        tax_rate_override: "",
        notes: "",
        source_account: "",
        contribution_source_mode: "inherit",
        contribution_source_ids: [],
    });
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustAssetId, setAdjustAssetId] = useState<EntityId | null>(null);
    const [adjustForm, setAdjustForm] = useState({ new_balance: "" });
    const [adjustError, setAdjustError] = useState<string | null>(null);
    const [catForm, setCatForm] = useState({
        name: "",
        color: "#4f7fff",
        icon: "💰",
    });

    // Wealth trend
    const [portfolioHistory, setPortfolioHistory] = useState<
        PortfolioHistoryPoint[]
    >([]);
    const [wealthTimeRange, setWealthTimeRange] =
        useState<WealthTimeRange>("1M");
    const [wealthRangeOffset, setWealthRangeOffset] = useState(0); // months back from today (0 = current)
    const [wealthMetrics, setWealthMetrics] = useState<WealthMetric[]>(() => {
        try {
            return normalizeWealthMetrics(
                JSON.parse(
                    localStorage.getItem("wealthChartMetrics") || '["wealth"]',
                ),
            );
        } catch {
            return ["wealth"];
        }
    });
    const [fireGoal, setFireGoal] = useState<number | null>(null);

    const _initMonthlyPrefs = () => {
        try {
            return normalizeMonthlyOverviewPrefs(
                JSON.parse(
                    localStorage.getItem("monthlyOverviewPrefs") || "{}",
                ),
            );
        } catch {
            return normalizeMonthlyOverviewPrefs({});
        }
    };
    const [monthlyOverview, setMonthlyOverview] = useState<DataObject | null>(
        null,
    );
    const [monthlyOverviewAvailableYears, setMonthlyOverviewAvailableYears] =
        useState<number[]>([]);
    const [monthlyOverviewPrefs, setMonthlyOverviewPrefs] =
        useState<MonthlyOverviewPreferences>(_initMonthlyPrefs);
    // Bumped on data mutations so Compare mode and prev-year fetches re-run.
    const [monthlyOverviewRefreshKey, setMonthlyOverviewRefreshKey] =
        useState(0);
    return {
        dashConfig,
        setDashConfig,
        showDashSettings,
        setShowDashSettings,
        expenses,
        setExpenses,
        trendExpenses,
        setTrendExpenses,
        trendIncomes,
        setTrendIncomes,
        categories,
        setCategories,
        assets,
        setAssets,
        summary,
        setSummary,
        expSummary,
        setExpSummary,
        recurringStatus,
        setRecurringStatus,
        expSummaryCurrentMonth,
        setExpSummaryCurrentMonth,
        monthlyInvestmentStats,
        setMonthlyInvestmentStats,
        invStatsMonth,
        setInvStatsMonth,
        invStatsYear,
        setInvStatsYear,
        investmentTypes,
        setInvestmentTypes,
        contributionSources,
        setContributionSources,
        showInvTypeModal,
        setShowInvTypeModal,
        invTypeForm,
        setInvTypeForm,
        editingInvTypeId,
        setEditingInvTypeId,
        allocationData,
        setAllocationData,
        budgets,
        setBudgets,
        editingBudgetCat,
        setEditingBudgetCat,
        budgetInputVal,
        setBudgetInputVal,
        recurringExpenses,
        setRecurringExpenses,
        showRecurringModal,
        setShowRecurringModal,
        editingRecurringId,
        setEditingRecurringId,
        recurringForm,
        setRecurringForm,
        recurringError,
        setRecurringError,
        recurringSaving,
        setRecurringSaving,
        generateRecurringMsg,
        setGenerateRecurringMsg,
        recurringInvestmentPlans,
        setRecurringInvestmentPlans,
        showPacModal,
        setShowPacModal,
        editingPacId,
        setEditingPacId,
        pacForm,
        setPacForm,
        pacError,
        setPacError,
        pacSaving,
        setPacSaving,
        generatePacMsg,
        setGeneratePacMsg,
        filterMonth,
        setFilterMonth,
        filterYear,
        setFilterYear,
        filterCat,
        setFilterCat,
        filterAccount,
        setFilterAccount,
        viewMode,
        setViewMode,
        cashflowDir,
        setCashflowDir,
        filterVerified,
        setFilterVerified,
        appLoading,
        setAppLoading,
        bootstrapReady,
        setBootstrapReady,
        fetchError,
        setFetchError,
        refreshing,
        setRefreshing,
        refreshMsg,
        setRefreshMsg,
        priceRefreshCounter,
        setPriceRefreshCounter,
        showExpModal,
        setShowExpModal,
        editingExpenseId,
        setEditingExpenseId,
        expError,
        setExpError,
        modalDir,
        setModalDir,
        pieHover,
        setPieHover,
        showAssetModal,
        setShowAssetModal,
        editingAssetId,
        setEditingAssetId,
        assetError,
        setAssetError,
        assetSaving,
        setAssetSaving,
        allocChartType,
        setAllocChartType,
        settingsCatType,
        setSettingsCatType,
        settingsMenu,
        setSettingsMenu,
        showCatAddModal,
        setShowCatAddModal,
        catAddContext,
        setCatAddContext,
        editingCatId,
        setEditingCatId,
        catAddError,
        setCatAddError,
        demoLoading,
        setDemoLoading,
        demoError,
        setDemoError,
        invTypeError,
        setInvTypeError,
        expandedCats,
        setExpandedCats,
        deleteExpenseTarget,
        setDeleteExpenseTarget,
        resetConfirm,
        setResetConfirm,
        resetUnderstood,
        setResetUnderstood,
        resetMsg,
        setResetMsg,
        demoConfirm,
        setDemoConfirm,
        demoUnderstood,
        setDemoUnderstood,
        deleteCatFlow,
        setDeleteCatFlow,
        deleteInvTypeFlow,
        setDeleteInvTypeFlow,
        taxPropagationFlow,
        setTaxPropagationFlow,
        editingAssetOrigOverrideRef,
        editingInvTypeOrigRateRef,
        showTransferModal,
        setShowTransferModal,
        transferForm,
        setTransferForm,
        transferWarning,
        setTransferWarning,
        transferError,
        setTransferError,
        transferLoading,
        setTransferLoading,
        expForm,
        setExpForm,
        assetForm,
        setAssetForm,
        showAdjustModal,
        setShowAdjustModal,
        adjustAssetId,
        setAdjustAssetId,
        adjustForm,
        setAdjustForm,
        adjustError,
        setAdjustError,
        catForm,
        setCatForm,
        portfolioHistory,
        setPortfolioHistory,
        wealthTimeRange,
        setWealthTimeRange,
        wealthRangeOffset,
        setWealthRangeOffset,
        wealthMetrics,
        setWealthMetrics,
        fireGoal,
        setFireGoal,
        monthlyOverview,
        setMonthlyOverview,
        monthlyOverviewAvailableYears,
        setMonthlyOverviewAvailableYears,
        monthlyOverviewPrefs,
        setMonthlyOverviewPrefs,
        monthlyOverviewRefreshKey,
        setMonthlyOverviewRefreshKey,
    };
}

export type AppProviderState = ReturnType<typeof useAppProviderState>;
