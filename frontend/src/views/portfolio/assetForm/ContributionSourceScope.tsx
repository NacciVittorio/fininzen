import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../../components/FieldLabel";
import type { ContributionSource } from "../../../api/types";
import type { Translator } from "../../../types";
import type { AssetForm } from "../../../context/useAppProviderState";

export default function ContributionSourceScope({
    assetForm,
    setAssetForm,
    activeContributionSources,
    T,
}: {
    assetForm: AssetForm;
    setAssetForm: Dispatch<SetStateAction<AssetForm>>;
    activeContributionSources: readonly ContributionSource[];
    T: Translator;
}) {
    return (
        <div>
            <FieldLabel text={T("label_contribution_sources_asset")} />
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    background: "var(--card-inset)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                    padding: 10,
                }}
            >
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 13,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={
                            (assetForm.contribution_source_ids || []).length ===
                            0
                        }
                        onChange={(event) => {
                            if (event.target.checked) {
                                setAssetForm((previous) => ({
                                    ...previous,
                                    contribution_source_ids: [],
                                }));
                            }
                        }}
                    />
                    {T("contribution_sources_all")}
                </label>
                {activeContributionSources.map((source) => {
                    const selected = (
                        assetForm.contribution_source_ids || []
                    ).includes(String(source.id));
                    return (
                        <label
                            key={source.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                fontSize: 13,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) =>
                                    setAssetForm((previous) => {
                                        const current =
                                            previous.contribution_source_ids ||
                                            [];
                                        const id = String(source.id);
                                        const next = event.target.checked
                                            ? Array.from(
                                                  new Set([...current, id]),
                                              )
                                            : current.filter(
                                                  (item) => item !== id,
                                              );
                                        return {
                                            ...previous,
                                            contribution_source_ids: next,
                                        };
                                    })
                                }
                            />
                            {source.name}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
