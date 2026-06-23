"use client";

import type { ComponentProps } from "react";
import { CategoryModals } from "./CategoryModals";
import { ContributionSourceModals } from "./ContributionSourceModals";
import { DangerModals } from "./DangerModals";
import { InvestmentTypeModals } from "./InvestmentTypeModals";

type SettingsManagementModalsProps = ComponentProps<typeof DangerModals> &
    ComponentProps<typeof CategoryModals> &
    ComponentProps<typeof InvestmentTypeModals> &
    ComponentProps<typeof ContributionSourceModals>;

export function SettingsManagementModals(props: SettingsManagementModalsProps) {
    return (
        <>
            <DangerModals {...props} />
            <CategoryModals {...props} />
            <InvestmentTypeModals {...props} />
            <ContributionSourceModals {...props} />
        </>
    );
}
