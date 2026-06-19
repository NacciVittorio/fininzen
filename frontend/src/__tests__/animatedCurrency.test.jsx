import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import AnimatedCurrency from "../components/AnimatedCurrency.jsx";

const containers = [];

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  containers.push({ root, container });
  return container;
}

afterEach(() => {
  containers.forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  containers.length = 0;
});

describe("AnimatedCurrency", () => {
  it("renders final EUR value after animation", async () => {
    // Mock matchMedia for prefers-reduced-motion (not supported in jsdom)
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    // Use reduced-motion=true path for deterministic test
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const container = render(<AnimatedCurrency value={1000} />);
    expect(container.textContent).toContain("1000");
  });

  it("renders zero correctly", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const container = render(<AnimatedCurrency value={0} />);
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("renders decimal value without rounding (regression: 7.5 was displayed as 8)", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const container = render(<AnimatedCurrency value={7.5} />);
    expect(container.textContent).toMatch(/7[,.]50/);
    expect(container.textContent).not.toContain("8");
  });
});
