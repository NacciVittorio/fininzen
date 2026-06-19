import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import SwipeRow from "../components/ui/SwipeRow.jsx";

const mounted = [];

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

afterEach(() => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    act(() => root.unmount());
    if (container.parentNode) container.parentNode.removeChild(container);
  }
});

const pointer = (el, type, clientX) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX }));
  });

const baseActions = (onPress = () => {}) => [
  {
    key: "delete",
    label: "Delete",
    background: "var(--danger)",
    onPress,
    testId: "swipe-action-delete",
  },
];

const leftActions = (onPress = () => {}) => [
  {
    key: "edit",
    label: "Edit",
    background: "var(--accent)",
    onPress,
    testId: "swipe-action-edit",
  },
];

describe("SwipeRow", () => {
  it("renders children and the data-swipe-row guard attribute", () => {
    const c = renderTracked(
      <SwipeRow rowId={1} actions={baseActions()}>
        <span>Row content</span>
      </SwipeRow>,
    );
    expect(c.textContent).toContain("Row content");
    expect(c.querySelector("[data-swipe-row='true']")).toBeTruthy();
  });

  it("latches open when dragged past the threshold", () => {
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={42}
        openRowId={null}
        onRequestOpen={onRequestOpen}
        actions={baseActions()}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const row = c.querySelector("[role='button']");
    pointer(row, "pointerdown", 200);
    pointer(row, "pointermove", 120); // dx = -80 < -56
    pointer(row, "pointerup", 120);
    expect(onRequestOpen).toHaveBeenCalledWith(42);
  });

  it("does not latch on a short drag", () => {
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={42}
        openRowId={null}
        onRequestOpen={onRequestOpen}
        actions={baseActions()}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const row = c.querySelector("[role='button']");
    pointer(row, "pointerdown", 200);
    pointer(row, "pointermove", 180); // dx = -20 > -56
    pointer(row, "pointerup", 180);
    expect(onRequestOpen).not.toHaveBeenCalled();
  });

  it("fires onTap on a clean tap and suppresses it mid-swipe", () => {
    const onTap = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={1}
        openRowId={null}
        actions={baseActions()}
        onTap={onTap}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const row = c.querySelector("[role='button']");

    // mid-swipe click (pointer moved 20px, no pointerup yet) → suppressed
    pointer(row, "pointerdown", 200);
    pointer(row, "pointermove", 180);
    pointer(row, "click", 180);
    expect(onTap).not.toHaveBeenCalled();
    pointer(row, "pointerup", 180);

    // clean tap → fires
    pointer(row, "click", 200);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("renders actions when latched open and closes after pressing one", () => {
    const onPress = vi.fn();
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={7}
        openRowId={7}
        onRequestOpen={onRequestOpen}
        actions={baseActions(onPress)}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const btn = c.querySelector("[data-testid='swipe-action-delete']");
    expect(btn).toBeTruthy();
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRequestOpen).toHaveBeenCalledWith(null);
  });

  it("latches the left side open on a right-swipe past the threshold", () => {
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={9}
        openRowId={null}
        onRequestOpen={onRequestOpen}
        actions={baseActions()}
        leftActions={leftActions()}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const row = c.querySelector("[role='button']");
    pointer(row, "pointerdown", 100);
    pointer(row, "pointermove", 180); // dx = +80 > +56
    pointer(row, "pointerup", 180);
    expect(onRequestOpen).toHaveBeenCalledWith(9);
  });

  it("renders left actions when open and fires onPress", () => {
    const onPress = vi.fn();
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={3}
        openRowId={3}
        onRequestOpen={onRequestOpen}
        actions={baseActions()}
        leftActions={leftActions(onPress)}
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const btn = c.querySelector("[data-testid='swipe-action-edit']");
    expect(btn).toBeTruthy();
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRequestOpen).toHaveBeenCalledWith(null);
  });

  it("does not swipe when disabled", () => {
    const onRequestOpen = vi.fn();
    const c = renderTracked(
      <SwipeRow
        rowId={1}
        openRowId={null}
        onRequestOpen={onRequestOpen}
        actions={baseActions()}
        disabled
      >
        <span>Row</span>
      </SwipeRow>,
    );
    const row = c.querySelector("[role='button']");
    pointer(row, "pointerdown", 200);
    pointer(row, "pointermove", 100);
    pointer(row, "pointerup", 100);
    expect(onRequestOpen).not.toHaveBeenCalled();
    // action buttons not rendered while disabled
    expect(c.querySelector("[data-testid='swipe-action-delete']")).toBeNull();
  });
});
