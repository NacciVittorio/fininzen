import {
    useCallback,
    useRef,
    type Dispatch,
    type SetStateAction,
    type TouchEvent,
} from "react";
import type { NavigationItem } from "./AppChrome";

type SwipePoint = { x: number; y: number };

export function useTabSwipe(
    visibleNavItems: readonly NavigationItem[],
    tab: string,
    setTab: Dispatch<SetStateAction<string>>,
    enabled: boolean,
) {
    const startRef = useRef<SwipePoint | null>(null);

    const onTouchStart = useCallback(
        (event: TouchEvent<HTMLElement>) => {
            if (
                !enabled ||
                window.innerWidth >= 760 ||
                (event.target instanceof Element &&
                    event.target.closest("[data-swipe-row]"))
            ) {
                return;
            }
            const touch = event.touches[0];
            if (!touch) return;
            startRef.current = { x: touch.clientX, y: touch.clientY };
        },
        [enabled],
    );

    const onTouchEnd = useCallback(
        (event: TouchEvent<HTMLElement>) => {
            if (!startRef.current) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const dx = touch.clientX - startRef.current.x;
            const dy = touch.clientY - startRef.current.y;
            startRef.current = null;
            if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

            const ids = visibleNavItems.map((item) => item.id);
            const index = ids.indexOf(tab);
            const nextTab =
                dx < 0 && index < ids.length - 1
                    ? ids[index + 1]
                    : dx > 0 && index > 0
                      ? ids[index - 1]
                      : undefined;
            if (nextTab) setTab(nextTab);
        },
        [visibleNavItems, tab, setTab],
    );

    return { onTouchStart, onTouchEnd };
}
