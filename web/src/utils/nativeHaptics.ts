// Light tactile feedback for key native (iOS) interactions.
//
// Unlike the other native utils, this is not a boot-time registrar — it's
// called directly from the interaction handlers that want feedback (bottom
// nav tab switches, FAB taps). Capacitor.isNativePlatform() makes it a no-op
// on the web build and during the static export's Node prerender.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function triggerHaptic(style: ImpactStyle = ImpactStyle.Light): void {
    if (!Capacitor.isNativePlatform()) return;
    void Haptics.impact({ style });
}
