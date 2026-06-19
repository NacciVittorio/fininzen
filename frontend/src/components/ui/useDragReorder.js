import { useRef, useState } from "react";

// Pointer-Events drag-to-reorder for fixed-height vertical lists (no deps).
// Spread getHandleProps(index) on the drag handle only — it sets
// touch-action: none there so the rest of the row keeps scrolling — and
// getRowStyle(index) on each row. onCommit(fromIndex, toIndex) fires on drop.
export function useDragReorder({ count, rowHeight, onCommit }) {
  const [drag, setDrag] = useState(null); // { from, to, dy }
  const startY = useRef(0);

  const getHandleProps = (index) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startY.current = e.clientY;
      setDrag({ from: index, to: index, dy: 0 });
    },
    onPointerMove: (e) => {
      if (!drag) return;
      const dy = e.clientY - startY.current;
      const to = Math.max(
        0,
        Math.min(count - 1, drag.from + Math.round(dy / rowHeight)),
      );
      setDrag({ from: drag.from, to, dy });
    },
    onPointerUp: () => {
      if (!drag) return;
      if (drag.to !== drag.from) onCommit(drag.from, drag.to);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    style: { touchAction: "none", cursor: drag ? "grabbing" : "grab" },
  });

  const getRowStyle = (index) => {
    if (!drag) return { transition: "transform 0.15s ease" };
    if (index === drag.from) {
      return {
        transform: `translateY(${drag.dy}px) scale(1.02)`,
        zIndex: 2,
        position: "relative",
        boxShadow: "var(--shadow-deep)",
        transition: "none",
      };
    }
    const shift =
      index > drag.from && index <= drag.to
        ? -rowHeight
        : index < drag.from && index >= drag.to
          ? rowHeight
          : 0;
    return {
      transform: `translateY(${shift}px)`,
      transition: "transform 0.15s ease",
    };
  };

  return { dragging: !!drag, getHandleProps, getRowStyle };
}
