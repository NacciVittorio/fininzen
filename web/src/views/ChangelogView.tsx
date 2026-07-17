"use client";

import { useRouter } from "next/navigation";

import { Icon, PageHeader, Pill } from "../components/ui";
import { RELEASE_NOTES, UNRELEASED } from "../content/releaseNotes";
import { useApp } from "../context/useApp";
import { useAppVersion } from "../hooks/useAppVersion";
import { formatDate } from "../utils/formatters";

export default function ChangelogView() {
    const { T, lang } = useApp();
    const router = useRouter();
    const currentVersion = useAppVersion();
    // An entry still waiting for `just release` to stamp it isn't public yet.
    const notes = RELEASE_NOTES.filter((note) => note.version !== UNRELEASED);

    // The changelog is a full-page view with no bottom-nav entry of its own, so
    // give it an explicit way out. Return to wherever the user came from (the
    // release banner or Settings → About), falling back to the dashboard when
    // there's no history to pop (deep link / hard refresh).
    const close = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/dashboard");
        }
    };

    return (
        <div>
            <PageHeader
                title={T("changelog_title")}
                subtitle={T("changelog_subtitle")}
                actions={
                    <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={close}
                        data-testid="changelog-close"
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
            {notes.length === 0 ? (
                <div
                    className="card"
                    style={{
                        padding: 24,
                        textAlign: "center",
                        color: "var(--fg-soft)",
                        fontSize: 13,
                    }}
                >
                    {T("changelog_empty")}
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                    }}
                >
                    {notes.map((note) => (
                        <section
                            key={note.version}
                            className="card"
                            style={{ padding: 20 }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    flexWrap: "wrap",
                                    marginBottom: 4,
                                }}
                            >
                                <h2
                                    className="mono"
                                    style={{
                                        fontSize: 16,
                                        fontWeight: 600,
                                        margin: 0,
                                    }}
                                >
                                    v{note.version}
                                </h2>
                                {note.version === currentVersion && (
                                    <Pill tone="success">
                                        {T("changelog_current")}
                                    </Pill>
                                )}
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    marginBottom: 12,
                                }}
                            >
                                {formatDate(note.date)}
                            </div>
                            <ul
                                style={{
                                    margin: 0,
                                    paddingLeft: 20,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                }}
                            >
                                {note.highlights[lang].map((item) => (
                                    <li
                                        key={item}
                                        style={{
                                            fontSize: 13,
                                            lineHeight: 1.6,
                                            color: "var(--fg)",
                                        }}
                                    >
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
