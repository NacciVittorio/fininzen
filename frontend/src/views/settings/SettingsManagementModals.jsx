import { CategoryModals } from "./CategoryModals";
import { ContributionSourceModals } from "./ContributionSourceModals";
import { DangerModals } from "./DangerModals";
import { InvestmentTypeModals } from "./InvestmentTypeModals";

export function SettingsManagementModals(props) {
  return (
    <>
      <DangerModals {...props} />
      <CategoryModals {...props} />
      <InvestmentTypeModals {...props} />
      <ContributionSourceModals {...props} />
    </>
  );
}
