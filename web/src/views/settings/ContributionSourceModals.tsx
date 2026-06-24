"use client";

import type { ComponentProps } from "react";
import { ContributionSourceEditorModal } from "./ContributionSourceEditorModal";
import { DeleteContributionSourceModal } from "./DeleteContributionSourceModal";

type ContributionSourceModalsProps = ComponentProps<
    typeof ContributionSourceEditorModal
> &
    ComponentProps<typeof DeleteContributionSourceModal>;

export function ContributionSourceModals(props: ContributionSourceModalsProps) {
    return (
        <>
            <ContributionSourceEditorModal {...props} />
            <DeleteContributionSourceModal {...props} />
        </>
    );
}
