import { DeleteInvestmentTypeModal } from "./DeleteInvestmentTypeModal";
import { InvestmentTypeEditorModal } from "./InvestmentTypeEditorModal";

export function InvestmentTypeModals(props) {
  return (
    <>
      <InvestmentTypeEditorModal {...props} />
      <DeleteInvestmentTypeModal {...props} />
    </>
  );
}
