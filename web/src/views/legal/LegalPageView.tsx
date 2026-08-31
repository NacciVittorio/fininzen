"use client";

import { useRouter } from "next/navigation";

import { Icon, PageHeader } from "../../components/ui";
import type { PolicySection } from "../../content/privacyPolicy";
import { useApp } from "../../context/useApp";
import { formatDate } from "../../utils/formatters";

type LegalPageViewProps = {
    title: string;
    subtitle: string;
    updatedAt: string;
    sections: PolicySection[];
};

// Shared renderer for /privacy and /terms. Public routes (outside the (app)
// route group, so no AuthGate) — must render for both anonymous visitors and
// logged-in users, hence useApp() directly rather than a hook that assumes
// an authenticated context.
export function LegalPageView({
    title,
    subtitle,
    updatedAt,
    sections,
}: LegalPageViewProps) {
    const { T, lang, isAuthenticated } = useApp();
    const router = useRouter();

    const close = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push(isAuthenticated ? "/dashboard" : "/login");
        }
    };

    return (
        <div className="page-narrow">
            <PageHeader
                title={title}
                subtitle={subtitle}
                actions={
                    <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={close}
                        aria-label={T("btn_close")}
                        title={T("btn_close")}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px 8px",
                        }}
                    >
                        <Icon name="x" size={16} aria-hidden="true" />
                    </button>
                }
            />
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginBottom: 16,
                }}
            >
                {T("legal_last_updated")}: {formatDate(updatedAt)}
            </div>
            {lang === "en" && (
                <div
                    className="card"
                    style={{
                        padding: 14,
                        marginBottom: 16,
                        fontSize: 13,
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("legal_italian_only_notice")}
                </div>
            )}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                {sections.map((section) => (
                    <section
                        key={section.id}
                        className="card"
                        style={{ padding: 20 }}
                    >
                        <h2
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                margin: "0 0 10px",
                            }}
                        >
                            {section.heading}
                        </h2>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            {section.body.map((paragraph, i) => (
                                <p
                                    key={i}
                                    style={{
                                        fontSize: 13,
                                        lineHeight: 1.6,
                                        color: "var(--fg)",
                                        margin: 0,
                                    }}
                                >
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
