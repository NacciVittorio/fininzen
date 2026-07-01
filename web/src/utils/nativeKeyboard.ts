// Keyboard resize behavior for the native (iOS) build.
//
// WKWebView's default keyboard handling can leave a focused input hidden
// behind the software keyboard (there is no native input accessory view like
// a real iOS app has). "native" resize mode shrinks the WKWebView's own
// viewport when the keyboard appears, which combined with the app's own
// scroll-into-view behavior on focus keeps inputs visible above the keyboard
// and above the bottom tab bar.
//
// On the web build (and during the Node prerender of the static export)
// Capacitor.isNativePlatform() is false, so this is a no-op.

import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

export function registerNativeKeyboard(): void {
    if (!Capacitor.isNativePlatform()) return;
    void Keyboard.setResizeMode({ mode: KeyboardResize.Native });
}
