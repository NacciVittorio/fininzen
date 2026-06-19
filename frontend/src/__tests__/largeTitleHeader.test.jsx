import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LargeTitleHeader from "../components/ui/LargeTitleHeader.jsx";

const mounted = [];
let ioCallbacks;

function renderTracked(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
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
    constructor(cb) {
      ioCallbacks.push(cb);
    }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    act(() => root.unmount());
    if (container.parentNode) container.parentNode.removeChild(container);
  }
  delete globalThis.IntersectionObserver;
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
    expect(c.querySelector(".page-title").textContent).toBe("Dashboard");
    expect(c.querySelector(".hero-number")).toBeTruthy();
    const bar = c.querySelector(".lt-header__bar");
    expect(bar).toBeTruthy();
    expect(bar.classList.contains("lt-header__bar--stuck")).toBe(false);
    expect(
      c.querySelector(".lt-header__bar-title").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("collapses when the sentinel leaves the viewport and expands back", () => {
    const c = renderTracked(<LargeTitleHeader title="Conti" />);
    expect(ioCallbacks.length).toBe(1);

    act(() => ioCallbacks[0]([{ isIntersecting: false }]));
    const bar = c.querySelector(".lt-header__bar");
    expect(bar.classList.contains("lt-header__bar--stuck")).toBe(true);
    expect(
      c.querySelector(".lt-header__bar-title").getAttribute("aria-hidden"),
    ).toBe("false");

    act(() => ioCallbacks[0]([{ isIntersecting: true }]));
    expect(bar.classList.contains("lt-header__bar--stuck")).toBe(false);
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
    expect(c.querySelector(".lt-header__bar [data-testid='eye']")).toBeTruthy();
    expect(c.querySelector("[data-testid='controls']")).toBeTruthy();
  });
});
