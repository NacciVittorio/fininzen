import { useEffect, useMemo } from "react";
import { SegmentedControl } from "../../components/ui";
import { useSettings } from "../../context/useSettings";
import {
  AccountTypesPanel,
  InvestmentTypesPanel,
} from "./InvestmentTypesPanel";
import { CashflowCategoriesPanel } from "./CashflowCategoriesPanel";
import { AccordionSection } from "./SettingsSections";

export function CategoryManagementSection({
  accordionProps,
  openNewInvType,
  handleEditInvType,
  openNewContributionSource,
  openEditContributionSource,
  openDeleteContributionSourceFlow,
}) {
  const {
    T,
    categories,
    investmentTypes,
    contributionSources,
    settingsCatType,
    setSettingsCatType,
    expandedCats,
    isFeatureEnabled,
    openDeleteInvTypeFlow,
    openEditCat,
    openAddSub,
    toggleExpandCat,
    openDeleteCatFlow,
    openAddMain,
  } = useSettings();

  const categoryTabs = useMemo(
    () =>
      [
        ["expense", T("expense_cats"), "cashflow"],
        ["income", T("income_cats"), "cashflow"],
        ["investments", T("investment_types"), "investments"],
        ["account_types", T("account_types"), "accounts"],
      ].filter(([, , feature]) => isFeatureEnabled(feature)),
    [T, isFeatureEnabled],
  );

  useEffect(() => {
    if (
      categoryTabs.length > 0 &&
      !categoryTabs.some(([type]) => type === settingsCatType)
    ) {
      setSettingsCatType(categoryTabs[0][0]);
    }
  }, [categoryTabs, settingsCatType, setSettingsCatType]);

  return (
    <AccordionSection sectionKey="categories" {...accordionProps}>
      <div>
        <div
          style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 16 }}
        >
          {T("manage_categories")}
        </div>

        <div
          className="row"
          style={{ gap: 6, marginBottom: 20, flexWrap: "wrap" }}
        >
          <SegmentedControl
            options={categoryTabs.map(([type, label]) => ({
              value: type,
              label,
            }))}
            value={settingsCatType}
            onChange={setSettingsCatType}
          />
        </div>

        {settingsCatType === "investments" && (
          <InvestmentTypesPanel
            T={T}
            investmentTypes={investmentTypes}
            contributionSources={contributionSources}
            handleEditInvType={handleEditInvType}
            openDeleteInvTypeFlow={openDeleteInvTypeFlow}
            openNewInvType={openNewInvType}
            openNewContributionSource={openNewContributionSource}
            openEditContributionSource={openEditContributionSource}
            openDeleteContributionSourceFlow={openDeleteContributionSourceFlow}
          />
        )}

        {settingsCatType === "account_types" && (
          <AccountTypesPanel
            T={T}
            investmentTypes={investmentTypes}
            handleEditInvType={handleEditInvType}
            openDeleteInvTypeFlow={openDeleteInvTypeFlow}
            openNewInvType={openNewInvType}
          />
        )}

        {(settingsCatType === "expense" || settingsCatType === "income") && (
          <CashflowCategoriesPanel
            T={T}
            categories={categories}
            settingsCatType={settingsCatType}
            expandedCats={expandedCats}
            openEditCat={openEditCat}
            openAddSub={openAddSub}
            toggleExpandCat={toggleExpandCat}
            openDeleteCatFlow={openDeleteCatFlow}
            openAddMain={openAddMain}
          />
        )}
      </div>
    </AccordionSection>
  );
}
