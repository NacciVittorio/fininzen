import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { act } from "react";
import Modal from "../components/Modal";
import FieldLabel from "../components/FieldLabel";
import AssetCard from "../components/AssetCard";
import CategorySelect from "../components/CategorySelect";
import VerifiedToggleButton from "../components/ui/VerifiedToggleButton";
import BottomSheet from "../components/ui/BottomSheet";
import { PieChart } from "../components/Charts";
import InvestmentDeepDiveSheet from "../components/InvestmentDeepDiveSheet";
import { buildInvestmentDeepDiveGroups } from "../components/investmentDeepDiveModel";
import type { Translator } from "../types";
import type { Asset, Category } from "../api/types";

// Track roots so each test can properly unmount after itself
const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderTracked(ui: ReactElement): HTMLDivElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    act(() => {
        root = createRoot(container);
        root.render(ui);
    });
    mounted.push({ root, container });
    return container;
}

afterEach(() => {
    while (mounted.length) {
        const entry = mounted.pop()!;
        act(() => entry.root.unmount());
        const { container } = entry;
        if (container.parentNode) container.parentNode.removeChild(container);
    }
});

// Minimal T stub
const T: Translator = (k) => k;

// Minimal asset stub
const baseAsset = {
    id: 1,
    name: "VWCE",
    ticker: "",
    currency: "EUR",
    gain: 0,
    gain_percent: 0,
    invested_capital: 1000,
    current_value: 1000,
    shares: null,
    investment_type_detail: { name: "ETF", color: "#4f7fff", icon: "📊" },
} as unknown as Asset;

describe("FieldLabel", () => {
    it("renders the provided text", () => {
        const c = renderTracked(<FieldLabel text="Amount" />);
        expect(c.textContent).toBe("Amount");
    });
});

describe("VerifiedToggleButton", () => {
    it("renders the unverified state by default", () => {
        const c = renderTracked(
            <VerifiedToggleButton checked={false} onToggle={() => {}} T={T} />,
        );
        expect(c.textContent).toContain("verified_filter_no");
        expect(c.querySelector("button")!.getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("renders the verified state and calls onToggle", () => {
        const onToggle = vi.fn();
        const c = renderTracked(
            <VerifiedToggleButton checked={true} onToggle={onToggle} T={T} />,
        );
        expect(c.textContent).toContain("verified_filter_yes");

        act(() => {
            c.querySelector("button")!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        expect(onToggle).toHaveBeenCalledOnce();
    });
});

describe("Modal", () => {
    it("renders title and children", () => {
        const c = renderTracked(
            <Modal title="My Title" onClose={() => {}}>
                <span>Inner Content</span>
            </Modal>,
        );
        expect(c.textContent).toContain("My Title");
        expect(c.textContent).toContain("Inner Content");
    });

    it("calls onClose when backdrop is clicked", () => {
        const onClose = vi.fn();
        const c = renderTracked(
            <Modal title="Test" onClose={onClose}>
                <span>content</span>
            </Modal>,
        );
        const backdrop = c.firstChild!;
        act(() => {
            backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not call onClose when inner panel is clicked", () => {
        const onClose = vi.fn();
        const c = renderTracked(
            <Modal title="Test" onClose={onClose}>
                <span>content</span>
            </Modal>,
        );
        // Structure: c > backdrop > inner-panel > title + children
        // backdrop.firstChild is the inner panel (with stopPropagation)
        const innerPanel = c.firstChild!.firstChild!;
        act(() => {
            innerPanel.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });
        expect(onClose).not.toHaveBeenCalled();
    });
});

const cats: Category[] = [
    {
        id: 1,
        name: "Food",
        icon: "🍕",
        color: "#f00",
        parent: null,
        category_type: "expense",
    },
    {
        id: 2,
        name: "Pizza",
        icon: "🍕",
        color: "#f00",
        parent: 1,
        category_type: "expense",
    },
    {
        id: 3,
        name: "Salary",
        icon: "💰",
        color: "#0f0",
        parent: null,
        category_type: "income",
    },
    {
        id: 4,
        name: "Rent",
        icon: "🏠",
        color: "#00f",
        parent: null,
        category_type: "expense",
    },
] as unknown as Category[];

describe("CategorySelect", () => {
    it("renders placeholder when no value", () => {
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={() => {}}
                categories={cats}
                placeholder="Pick one"
            />,
        );
        expect(c.textContent).toContain("Pick one");
    });

    it("renders selected category name", () => {
        const c = renderTracked(
            <CategorySelect value="3" onChange={() => {}} categories={cats} />,
        );
        expect(c.textContent).toContain("Salary");
    });

    it("opens dropdown on trigger click", () => {
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={() => {}}
                categories={cats}
                categoryType="expense"
            />,
        );
        const trigger = c.querySelector("button")!;
        act(() =>
            trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        expect(c.textContent).toContain("Food");
        expect(c.textContent).toContain("Rent");
        // income category filtered out
        expect(c.textContent).not.toContain("Salary");
    });

    it("expands children when parent with subs is clicked", () => {
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={() => {}}
                categories={cats}
                categoryType="expense"
            />,
        );
        const trigger = c.querySelector("button")!;
        act(() =>
            trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        const buttons = c.querySelectorAll("button");
        // Find Food button (parent with children)
        const foodBtn = Array.from(buttons).find(
            (b) =>
                (b.textContent ?? "").includes("Food") &&
                !(b.textContent ?? "").includes("Pizza"),
        );
        act(() =>
            foodBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        expect(c.textContent).toContain("Pizza");
    });

    it("calls onChange when a leaf category is selected", () => {
        const onChange = vi.fn();
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={onChange}
                categories={cats}
                categoryType="expense"
            />,
        );
        // Open
        act(() =>
            c
                .querySelector("button")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        // Expand Food
        const buttons = () => Array.from(c.querySelectorAll("button"));
        const foodBtn = buttons().find(
            (b) =>
                (b.textContent ?? "").includes("Food") &&
                !(b.textContent ?? "").includes("Pizza"),
        );
        act(() =>
            foodBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        // Click Pizza (child)
        const pizzaBtn = buttons().find((b) =>
            (b.textContent ?? "").includes("Pizza"),
        );
        act(() =>
            pizzaBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        expect(onChange).toHaveBeenCalledWith("2");
    });

    it("selects leaf-only parent directly without expanding", () => {
        const onChange = vi.fn();
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={onChange}
                categories={cats}
                categoryType="expense"
            />,
        );
        act(() =>
            c
                .querySelector("button")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        const rentBtn = Array.from(c.querySelectorAll("button")).find((b) =>
            (b.textContent ?? "").includes("Rent"),
        );
        act(() =>
            rentBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        expect(onChange).toHaveBeenCalledWith("4");
    });

    it("selects leaf-only parent directly in multi-select mode", () => {
        const onMultiChange = vi.fn();
        const c = renderTracked(
            <CategorySelect
                multiple
                values={[]}
                onMultiChange={onMultiChange}
                categories={cats}
                categoryType="expense"
            />,
        );
        act(() =>
            c
                .querySelector("button")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        const rentBtn = Array.from(c.querySelectorAll("button")).find((b) =>
            (b.textContent ?? "").includes("Rent"),
        );
        act(() =>
            rentBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        expect(onMultiChange).toHaveBeenCalledWith(["4"]);
    });

    it("shows parent as selectable option when expanded", () => {
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={() => {}}
                categories={cats}
                categoryType="expense"
            />,
        );
        act(() =>
            c
                .querySelector("button")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        const buttons = () => Array.from(c.querySelectorAll("button"));
        // Expand Food
        const foodBtn = buttons().find(
            (b) =>
                (b.textContent ?? "").includes("Food") &&
                !(b.textContent ?? "").includes("Pizza"),
        );
        act(() =>
            foodBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        // After expansion, Food should appear at least twice (trigger row + expanded parent row)
        const foodButtons = buttons().filter((b) =>
            (b.textContent ?? "").trim().includes("Food"),
        );
        expect(foodButtons.length).toBeGreaterThanOrEqual(2);
    });

    it("calls onChange with parent id when parent selected from expanded list", () => {
        const onChange = vi.fn();
        const c = renderTracked(
            <CategorySelect
                value=""
                onChange={onChange}
                categories={cats}
                categoryType="expense"
            />,
        );
        act(() =>
            c
                .querySelector("button")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        const buttons = () => Array.from(c.querySelectorAll("button"));
        // Expand Food
        const foodBtn = buttons().find(
            (b) =>
                (b.textContent ?? "").includes("Food") &&
                !(b.textContent ?? "").includes("Pizza"),
        );
        act(() =>
            foodBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
        );
        // Click the Food button inside the expanded list (paddingLeft: 32, appears after expansion)
        const expandedFoodBtns = buttons().filter((b) =>
            (b.textContent ?? "").trim().includes("Food"),
        );
        // The last Food button is the one inside the expanded list
        const expandedParentBtn = expandedFoodBtns[expandedFoodBtns.length - 1];
        act(() =>
            expandedParentBtn!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            ),
        );
        expect(onChange).toHaveBeenCalledWith("1");
    });
});

describe("AssetCard", () => {
    it("renders the asset name", () => {
        const c = renderTracked(
            <AssetCard a={baseAsset} onDelete={() => {}} T={T} />,
        );
        expect(c.textContent).toContain("VWCE");
    });

    it("shows ticker when present", () => {
        const a = { ...baseAsset, ticker: "VWCE.DE" } as unknown as Asset;
        const c = renderTracked(<AssetCard a={a} onDelete={() => {}} T={T} />);
        expect(c.textContent).toContain("VWCE.DE");
    });

    it("shows archive without delete when only archive action is provided", () => {
        const c = renderTracked(
            <AssetCard a={baseAsset} onArchive={() => {}} T={T} />,
        );

        act(() => {
            c.querySelector("[role='button']")!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        expect(document.body.textContent).toContain("btn_archive");
        expect(document.body.textContent).not.toContain("btn_delete");
    });

    it("hides ticker tag when ticker is empty", () => {
        const a = { ...baseAsset, ticker: "" } as unknown as Asset;
        const c = renderTracked(<AssetCard a={a} onDelete={() => {}} T={T} />);
        // The ticker span uses class="tag" and appears only if a.ticker is truthy
        const tags = Array.from(c.querySelectorAll(".tag")).map((t) =>
            (t.textContent ?? "").trim(),
        );
        expect(tags.some((t) => t === "VWCE.DE")).toBe(false);
    });

    it("applies success color token for positive gain", () => {
        const a = {
            ...baseAsset,
            gain: 100,
            gain_percent: 10,
        } as unknown as Asset;
        const c = renderTracked(<AssetCard a={a} onDelete={() => {}} T={T} />);
        // The return cell applies the --success token as inline color when gain >= 0
        const positiveEl = Array.from(
            c.querySelectorAll<HTMLElement>("[style]"),
        ).find((el) => el.style.color === "var(--success)");
        expect(positiveEl).toBeTruthy();
    });

    it("warns when an ISIN-only automatic asset has no provider symbol", () => {
        const a = {
            ...baseAsset,
            isin: "QS0000061309",
            tracking_type: "AUTO",
            has_ticker: false,
        } as unknown as Asset;
        const c = renderTracked(<AssetCard a={a} onDelete={() => {}} T={T} />);

        // Tap on the row opens the detail sheet, which shows the ISIN warning.
        act(() => {
            c.querySelector("[role='button']")!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        // The detail sheet is portaled to document.body, outside the card container.
        expect(document.body.textContent).toContain("isin_no_match");
    });

    it("shows partial history warning directly in the detail sheet", async () => {
        const a = {
            ...baseAsset,
            ticker: "4ARLPAC",
            source_symbol: "4ARLPAC",
            tracking_type: "AUTO",
            has_ticker: true,
        } as unknown as Asset;
        const apiFetch = vi.fn().mockResolvedValue({
            json: () =>
                Promise.resolve({
                    points: [{ date: "2026-04-30", close: 42.056 }],
                    earliest_available: "2026-04-30",
                    requested_since: "2016-06-01",
                    status: "partial",
                    message: "no validated history",
                }),
        });
        const c = renderTracked(
            <AssetCard a={a} onDelete={() => {}} T={T} apiFetch={apiFetch} />,
        );

        await act(async () => {
            c.querySelector("[role='button']")!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        // The detail sheet is portaled to document.body, outside the card container.
        expect(document.body.textContent).toContain("no validated history");
    });

    it("loads history for manual assets too", async () => {
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000)
            .toISOString()
            .slice(0, 10);
        const a = {
            ...baseAsset,
            tracking_type: "MANUAL",
            ticker: "",
            source_symbol: "",
            has_ticker: false,
        } as unknown as Asset;
        const apiFetch = vi.fn().mockResolvedValue({
            json: () =>
                Promise.resolve({
                    points: [
                        { date: yesterday, close: 1000 },
                        { date: today, close: 1050 },
                    ],
                    earliest_available: yesterday,
                    requested_since: "2025-06-10",
                    status: "partial",
                    message: "manual history",
                }),
        });
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
        const c = renderTracked(
            <AssetCard a={a} onDelete={() => {}} T={T} apiFetch={apiFetch} />,
        );

        await act(async () => {
            c.querySelector("[role='button']")!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(apiFetch).toHaveBeenCalledWith(
            "/api/portfolio/1/price-history/?days=3650",
        );
        // The detail sheet is portaled to document.body, outside the card container.
        expect(document.body.textContent).toContain("price_chart");
        expect(document.body.textContent).toContain("expand_chart");
        vi.unstubAllGlobals();
    });
});

describe("BottomSheet", () => {
    it("portals the dialog to document.body, escaping a transformed ancestor", () => {
        // Reproduces the Safari bug: a fixed-position overlay nested inside an
        // ancestor with `transform` gets anchored to that ancestor, not the
        // viewport. The portal must lift the dialog out of the transformed subtree.
        const c = renderTracked(
            <div style={{ transform: "translateY(0)" }}>
                <BottomSheet open onClose={() => {}} ariaLabel="sheet">
                    <div>sheet body</div>
                </BottomSheet>
            </div>,
        );

        // The dialog is not rendered inside the transformed wrapper…
        expect(c.querySelector("[role='dialog']")).toBeNull();
        // …it lives directly under document.body instead.
        const dialog = document.body.querySelector("[role='dialog']");
        expect(dialog).not.toBeNull();
        expect(dialog!.textContent).toContain("sheet body");
        expect(c.contains(dialog)).toBe(false);
    });

    it("does not render anything while closed", () => {
        const c = renderTracked(
            <BottomSheet open={false} onClose={() => {}} ariaLabel="sheet">
                <div>hidden body</div>
            </BottomSheet>,
        );
        expect(document.body.querySelector("[role='dialog']")).toBeNull();
        expect(c.textContent).not.toContain("hidden body");
    });

    it("closes on Escape", () => {
        const onClose = vi.fn();
        renderTracked(
            <BottomSheet open onClose={onClose} ariaLabel="sheet">
                <div>body</div>
            </BottomSheet>,
        );
        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("focuses the first focusable child and traps Tab", () => {
        renderTracked(
            <BottomSheet open onClose={() => {}} ariaLabel="sheet">
                <button>First</button>
                <button>Last</button>
            </BottomSheet>,
        );
        const buttons = document.body.querySelectorAll<HTMLButtonElement>(
            "[role='dialog'] button",
        );
        expect(document.activeElement).toBe(buttons[0]);

        buttons[1]!.focus();
        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Tab",
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        expect(document.activeElement).toBe(buttons[0]);

        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Tab",
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        expect(document.activeElement).toBe(buttons[1]);
    });

    it("restores focus when unmounted", () => {
        const opener = document.createElement("button");
        document.body.appendChild(opener);
        opener.focus();

        renderTracked(
            <BottomSheet open onClose={() => {}} ariaLabel="sheet">
                <button>Inside</button>
            </BottomSheet>,
        );
        expect(document.activeElement!.textContent).toBe("Inside");

        const mountedSheet = mounted.pop()!;
        act(() => mountedSheet.root.unmount());
        mountedSheet.container.remove();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});

describe("PieChart", () => {
    it("renders a full circle for a single 100% slice (no degenerate arc)", () => {
        // A single slice spans the whole circle: start and end points of an SVG arc
        // coincide, so a wedge <path> would render nothing (the empty-donut bug).
        const c = renderTracked(
            <PieChart
                data={[
                    {
                        total: 100,
                        category__color: "#abcdef",
                        category__name: "EUR",
                    },
                ]}
            />,
        );
        // No wedge paths…
        expect(c.querySelectorAll("path").length).toBe(0);
        // …but a filled ring circle with the slice color is present.
        const ring = [...c.querySelectorAll("circle")].find(
            (el) => el.getAttribute("fill") === "#abcdef",
        );
        expect(ring).not.toBeUndefined();
    });

    it("renders one wedge path per slice when there are multiple", () => {
        const c = renderTracked(
            <PieChart
                data={[
                    {
                        total: 50,
                        category__color: "#111111",
                        category__name: "EUR",
                    },
                    {
                        total: 50,
                        category__color: "#222222",
                        category__name: "USD",
                    },
                ]}
            />,
        );
        expect(c.querySelectorAll("path").length).toBe(2);
    });
});

describe("InvestmentDeepDiveSheet", () => {
    const etf = {
        id: 11,
        name: "VWCE",
        current_value: 1000,
        gain_percent: 8.5,
        investment_type_detail: {
            id: 1,
            name: "ETF",
            color: "#4f7fff",
            is_bank_account: false,
        },
    } as unknown as Asset;
    const account = {
        id: 12,
        name: "Main Bank",
        current_value: 500,
        gain_percent: 0,
        investment_type_detail: {
            id: 2,
            name: "Bank",
            color: "#22d3ee",
            is_bank_account: true,
        },
    } as unknown as Asset;

    it("builds mixed investment and bank-account groups", () => {
        const { groups } = buildInvestmentDeepDiveGroups([etf, account]);
        expect(groups.map((g) => g.name)).toEqual(["ETF", "Bank"]);
        expect(groups.find((g) => g.name === "Bank")!.isBankAccount).toBe(true);
    });

    it("renders a deep dive for bank accounts", () => {
        renderTracked(
            <InvestmentDeepDiveSheet
                open
                onClose={() => {}}
                initialTypeId={2}
                assets={[account]}
                T={(key, fallback) => fallback ?? key}
            />,
        );
        expect(document.body.textContent).toContain("Bank");
        expect(document.body.textContent).toContain("Main Bank");
    });
});
