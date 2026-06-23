import type { Dispatch, SetStateAction } from "react";
import type { Category } from "../../api/types";
import type { DeleteCategoryFlow } from "../../context/useAppProviderState";
import type { Translator } from "../../types";

export function DeleteCategorySubcategoriesStep({
    T,
    deleteCatFlow,
    setDeleteCatFlow,
    categories,
}: {
    T: Translator;
    deleteCatFlow: DeleteCategoryFlow;
    setDeleteCatFlow: Dispatch<SetStateAction<DeleteCategoryFlow | null>>;
    categories: readonly Category[];
}) {
    return (
        <>
            {/* Step: subs */}
            {deleteCatFlow.step === "subs" &&
                (() => {
                    const subs = categories.filter(
                        (c) => c.parent === deleteCatFlow.cat.id,
                    );
                    const otherRootCats = categories.filter(
                        (c) =>
                            !c.parent &&
                            c.category_type ===
                                deleteCatFlow.cat.category_type &&
                            c.id !== deleteCatFlow.cat.id,
                    );
                    return (
                        <div>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: "var(--fg-soft)",
                                    marginBottom: 12,
                                }}
                            >
                                {T("cat_has_subs")}{" "}
                                <strong style={{ color: "var(--fg)" }}>
                                    {subs.length} {T("subcategories")}
                                </strong>
                                . {T("what_to_do_subs")}
                            </div>
                            {(
                                [
                                    ["delete", T("delete_subs_and_tx")],
                                    ["reassign", T("move_subs_to")],
                                    ["null", T("keep_subs")],
                                ] as [string, string][]
                            ).map(([val, label]) => (
                                <div
                                    key={val}
                                    className={`radio-opt${deleteCatFlow.subsChoice === val ? " selected" : ""}`}
                                    onClick={() =>
                                        setDeleteCatFlow((p) =>
                                            p
                                                ? {
                                                      ...p,
                                                      subsChoice: val,
                                                      subsTarget: null,
                                                  }
                                                : p,
                                        )
                                    }
                                    style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: 10,
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        cursor: "pointer",
                                        border: "1px solid",
                                        borderColor:
                                            deleteCatFlow.subsChoice === val
                                                ? "var(--accent-ring)"
                                                : "var(--rule)",
                                        background:
                                            deleteCatFlow.subsChoice === val
                                                ? "var(--accent-ring)"
                                                : "var(--card-inset)",
                                        marginBottom: 8,
                                    }}
                                >
                                    <input
                                        type="radio"
                                        readOnly
                                        checked={
                                            deleteCatFlow.subsChoice === val
                                        }
                                        style={{
                                            marginTop: 2,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <div>
                                        <div
                                            style={{
                                                fontSize: 13,
                                                color: "var(--fg)",
                                            }}
                                        >
                                            {label}
                                        </div>
                                        {val === "reassign" &&
                                            deleteCatFlow.subsChoice ===
                                                "reassign" && (
                                                <select
                                                    className="inp"
                                                    style={{
                                                        marginTop: 8,
                                                        fontSize: 12,
                                                    }}
                                                    value={
                                                        deleteCatFlow.subsTarget ||
                                                        ""
                                                    }
                                                    onChange={(e) =>
                                                        setDeleteCatFlow((p) =>
                                                            p
                                                                ? {
                                                                      ...p,
                                                                      subsTarget:
                                                                          e
                                                                              .target
                                                                              .value,
                                                                  }
                                                                : p,
                                                        )
                                                    }
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <option value="">
                                                        {T("select_category")}
                                                    </option>
                                                    {otherRootCats.map((c) => (
                                                        <option
                                                            key={c.id}
                                                            value={c.id}
                                                        >
                                                            {c.icon} {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                    </div>
                                </div>
                            ))}
                            <div
                                className="row"
                                style={{
                                    justifyContent: "flex-end",
                                    gap: 8,
                                    marginTop: 8,
                                }}
                            >
                                <button
                                    className="btn btn-g"
                                    onClick={() => setDeleteCatFlow(null)}
                                >
                                    {T("btn_cancel")}
                                </button>
                                <button
                                    className="btn btn-p"
                                    disabled={
                                        !deleteCatFlow.subsChoice ||
                                        (deleteCatFlow.subsChoice ===
                                            "reassign" &&
                                            !deleteCatFlow.subsTarget)
                                    }
                                    style={{
                                        opacity:
                                            !deleteCatFlow.subsChoice ||
                                            (deleteCatFlow.subsChoice ===
                                                "reassign" &&
                                                !deleteCatFlow.subsTarget)
                                                ? 0.5
                                                : 1,
                                    }}
                                    onClick={() =>
                                        setDeleteCatFlow((p) =>
                                            p ? { ...p, step: "expenses" } : p,
                                        )
                                    }
                                >
                                    {T("btn_next")}
                                </button>
                            </div>
                        </div>
                    );
                })()}
        </>
    );
}
