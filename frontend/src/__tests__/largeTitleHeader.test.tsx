import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { act } from "react";
import LargeTitleHeader from "../components/ui/LargeTitleHeader";

type IoEntry = { isIntersecting: boolean };
type IoCallback = (entries: IoEntry[]) => void;

const mounted: { root: Root; container: HTMLDivElement }[] = [];
let ioCallbacks: IoCallback[];

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

beforeEach(() => {
    ioCallbacks = [];
    globalThis.IntersectionObserver = class {
        constructor(cb: IoCallback) {
            ioCallbacks.push(cb);
        }
        observe() {}
        disconnect() {}
    } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
    while (mounted.length) {
        const entry = mounted.pop()!;
        act(() => entry.root.unmount());
        const { container } = entry;
        if (container.parentNode) container.parentNode.removeChild(container);
    }
    delete (globalThis as { IntersectionObserver?: unknown })
        .IntersectionObserver;
});

describe("LargeTitleHeader", () => {
    it("renders the large title, hero and compact bar (initially transparent)", () => {
        const c = renderTracked(
            <LargeTitleHeader
                title="Dashboard"
                eyebrow="Net Worth"
                hero={<div className="hero-number">123</div>}
                compactValue="€ 123"
            />,
        );
        expect(c.querySelector(".page-title")!.textContent).toBe("Dashboard");
        expect(c.querySelector(".hero-number")).toBeTruthy();
        const bar = c.querySelector(".lt-header__bar");
        expect(bar).toBeTruthy();
        expect(bar!.classList.contains("lt-header__bar--stuck")).toBe(false);
        expect(
            c
                .querySelector(".lt-header__bar-title")!
                .getAttribute("aria-hidden"),
        ).toBe("true");
    });

    it("collapses when the sentinel leaves the viewport and expands back", () => {
        const c = renderTracked(<LargeTitleHeader title="Conti" />);
        expect(ioCallbacks.length).toBe(1);

        act(() => ioCallbacks[0]!([{ isIntersecting: false }]));
        const bar = c.querySelector(".lt-header__bar");
        expect(bar!.classList.contains("lt-header__bar--stuck")).toBe(true);
        expect(
            c
                .querySelector(".lt-header__bar-title")!
                .getAttribute("aria-hidden"),
        ).toBe("false");

        act(() => ioCallbacks[0]!([{ isIntersecting: true }]));
        expect(bar!.classList.contains("lt-header__bar--stuck")).toBe(false);
    });

    it("renders actions in the compact bar and controls below the header", () => {
        const c = renderTracked(
            <LargeTitleHeader
                title="Patrimonio"
                actions={<button data-testid="eye">eye</button>}
            >
                <div data-testid="controls">pager</div>
            </LargeTitleHeader>,
        );
        expect(
            c.querySelector(".lt-header__bar [data-testid='eye']"),
        ).toBeTruthy();
        expect(c.querySelector("[data-testid='controls']")).toBeTruthy();
    });
});
