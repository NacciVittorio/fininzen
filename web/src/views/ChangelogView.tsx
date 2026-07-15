"use client";

import { PageHeader, Pill } from "../components/ui";
import { RELEASE_NOTES, UNRELEASED } from "../content/releaseNotes";
import { useApp } from "../context/useApp";
import { formatDate } from "../utils/formatters";

export default function ChangelogView() {
    const { T, lang } = useApp();
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    // An entry still waiting for `just release` to stamp it isn't public yet.
    const notes = RELEASE_NOTES.filter((note) => note.version !== UNRELEASED);

    return (
        <div>
            <PageHeader
                title={T("changelog_title")}
                subtitle={T("changelog_subtitle")}
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
                                        fontWeight: 700,
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
