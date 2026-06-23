import type { Category } from "../../api/types";
import type { EntityId } from "../../context/feedTypes";
import type { Translator } from "../../types";

type CashflowCatType = "expense" | "income";

type CategoryActions = {
    openEditCat: (category: Category) => void;
    openAddSub: (category: Category) => void;
    toggleExpandCat: (id: EntityId) => void;
    openDeleteCatFlow: (category: Category) => void;
};

export function CashflowCategoriesPanel({
    T,
    categories,
    settingsCatType,
    expandedCats,
    openEditCat,
    openAddSub,
    toggleExpandCat,
    openDeleteCatFlow,
    openAddMain,
}: CategoryActions & {
    T: Translator;
    categories: readonly Category[];
    settingsCatType: CashflowCatType;
    expandedCats: Set<EntityId>;
    openAddMain: (type: CashflowCatType) => void;
}) {
    const mainCategories = categories.filter(
        (category) =>
            !category.parent && category.category_type === settingsCatType,
    );

    return (
        <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {mainCategories.map((category) => (
                    <MainCategoryCard
                        key={category.id}
                        T={T}
                        category={category}
                        subcategories={categories.filter(
                            (item) => item.parent === category.id,
                        )}
                        isExpanded={expandedCats.has(category.id)}
                        openEditCat={openEditCat}
                        openAddSub={openAddSub}
                        toggleExpandCat={toggleExpandCat}
                        openDeleteCatFlow={openDeleteCatFlow}
                    />
                ))}

                {mainCategories.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "var(--fg-soft)",
                            fontSize: 13,
                            padding: "30px 0",
                        }}
                    >
                        {settingsCatType === "expense"
                            ? T("no_expense_cats")
                            : T("no_income_cats")}
                    </div>
                )}
            </div>

            <button
                className="btn btn-g"
                style={{ width: "100%", marginTop: 14, padding: "12px" }}
                onClick={() => openAddMain(settingsCatType)}
            >
                +{" "}
                {settingsCatType === "expense"
                    ? T("add_expense_cat")
                    : T("add_income_cat")}
            </button>
        </div>
    );
}

function MainCategoryCard({
    T,
    category,
    subcategories,
    isExpanded,
    openEditCat,
    openAddSub,
    toggleExpandCat,
    openDeleteCatFlow,
}: CategoryActions & {
    T: Translator;
    category: Category;
    subcategories: Category[];
    isExpanded: boolean;
}) {
    return (
        <div className="card" style={{ padding: 16 }}>
            <div className="between">
                <div
                    className="row"
                    style={{
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        flex: 1,
                    }}
                    onClick={() => openEditCat(category)}
                >
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            background: `${category.color}22`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 16,
                            flexShrink: 0,
                        }}
                    >
                        {category.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {category.name}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "var(--fg-soft)",
                                marginTop: 1,
                            }}
                        >
                            {Number(category.expense_count || 0) +
                                Number(
                                    category.subcategory_expense_count || 0,
                                )}{" "}
                            {T("transactions")}
                            {subcategories.length > 0 && (
                                <span
                                    style={{
                                        marginLeft: 6,
                                        background: "var(--rule)",
                                        borderRadius: 20,
                                        padding: "1px 6px",
                                    }}
                                >
                                    {subcategories.length} {T("subcategories")}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                    <button
                        className="btn btn-g btn-sm"
                        onClick={() => openAddSub(category)}
                        style={{ fontSize: 11 }}
                    >
                        {T("add_sub")}
                    </button>
                    {subcategories.length > 0 && (
                        <button
                            className="btn btn-g btn-sm"
                            onClick={() => toggleExpandCat(category.id)}
                            style={{ padding: "5px 8px", fontSize: 12 }}
                        >
                            {isExpanded ? "▼" : "▶"}
                        </button>
                    )}
                    <button
                        className="btn btn-g btn-sm"
                        onClick={() => openDeleteCatFlow(category)}
                        style={{ color: "var(--danger)", padding: "5px 8px" }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {subcategories.length > 0 && isExpanded && (
                <SubcategoryList
                    subcategories={subcategories}
                    openEditCat={openEditCat}
                    openDeleteCatFlow={openDeleteCatFlow}
                />
            )}
        </div>
    );
}

function SubcategoryList({
    subcategories,
    openEditCat,
    openDeleteCatFlow,
}: {
    subcategories: Category[];
    openEditCat: (category: Category) => void;
    openDeleteCatFlow: (category: Category) => void;
}) {
    return (
        <div
            style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--card-inset)",
            }}
        >
            {subcategories.map((subcategory) => (
                <div key={subcategory.id} className="sub-item">
                    <div
                        className="row"
                        style={{
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            flex: 1,
                        }}
                        onClick={() => openEditCat(subcategory)}
                    >
                        <span style={{ color: "var(--accent)", fontSize: 12 }}>
                            ↳
                        </span>
                        <div
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: subcategory.color,
                                flexShrink: 0,
                            }}
                        />
                        <span style={{ fontSize: 13 }}>
                            {subcategory.icon} {subcategory.name}
                        </span>
                        {subcategory.expense_count > 0 && (
                            <span
                                style={{
                                    fontSize: 11,
                                    color: "var(--fg-soft)",
                                }}
                            >
                                ({subcategory.expense_count})
                            </span>
                        )}
                    </div>
                    <div className="row" style={{ gap: 5 }}>
                        <button
                            className="btn btn-g btn-sm"
                            onClick={() => openDeleteCatFlow(subcategory)}
                            style={{
                                color: "var(--danger)",
                                padding: "3px 7px",
                                fontSize: 13,
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
