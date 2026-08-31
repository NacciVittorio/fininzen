"use client";

import {
    TERMS_OF_SERVICE_SECTIONS,
    TERMS_OF_SERVICE_UPDATED_AT,
} from "../../content/termsOfService";
import { useApp } from "../../context/useApp";
import { LegalPageView } from "./LegalPageView";

export default function TermsOfServiceView() {
    const { T } = useApp();

    return (
        <LegalPageView
            title={T("legal_terms_page_title")}
            subtitle={T("legal_terms_page_subtitle")}
            updatedAt={TERMS_OF_SERVICE_UPDATED_AT}
            sections={TERMS_OF_SERVICE_SECTIONS}
        />
    );
}
