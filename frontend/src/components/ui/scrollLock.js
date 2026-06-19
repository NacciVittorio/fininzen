// Shared ref-counted body scroll-lock. Overlays (BottomSheet, Drawer, modals)
// must not save/restore document.body.style.overflow individually: with two
// overlays open at once (or in quick succession) each captures the other's
// "hidden" as the value to restore, leaving the body permanently locked.
// Counting lockers instead makes nesting and overlap safe — the body unlocks
// only when the last overlay releases.

let lockCount = 0;
let prevOverflow = "";

export function lockBodyScroll() {
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

export function unlockBodyScroll() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = prevOverflow;
  }
}
