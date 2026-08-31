"use client";

import {
    PRIVACY_POLICY_SECTIONS,
    PRIVACY_POLICY_UPDATED_AT,
} from "../../content/privacyPolicy";
import { useApp } from "../../context/useApp";
import { LegalPageView } from "./LegalPageView";

export default function PrivacyPolicyView() {
    const { T } = useApp();

    return (
        <LegalPageView
            title={T("legal_privacy_page_title")}
            subtitle={T("legal_privacy_page_subtitle")}
            updatedAt={PRIVACY_POLICY_UPDATED_AT}
            sections={PRIVACY_POLICY_SECTIONS}
        />
    );
}
