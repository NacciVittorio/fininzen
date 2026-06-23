import type { ComponentProps } from "react";
import { DeleteInvestmentTypeModal } from "./DeleteInvestmentTypeModal";
import { InvestmentTypeEditorModal } from "./InvestmentTypeEditorModal";

type InvestmentTypeModalsProps = ComponentProps<
    typeof InvestmentTypeEditorModal
> &
    ComponentProps<typeof DeleteInvestmentTypeModal>;

export function InvestmentTypeModals(props: InvestmentTypeModalsProps) {
    return (
        <>
            <InvestmentTypeEditorModal {...props} />
            <DeleteInvestmentTypeModal {...props} />
        </>
    );
}
