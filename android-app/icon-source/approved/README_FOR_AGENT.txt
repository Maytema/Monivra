MONIVRA — ICON + HEADER UPDATE (for the Android agent)

1) MONIVRA_APP_ICON_1024.png is the approved visual reference for the ANDROID LAUNCHER ICON: a small square icon, WITHOUT the Monivra wordmark. The 512/192/48 px files are scaled previews/exports, not separate designs. Do not put the name inside the launcher icon. Rebuild Android adaptive icon resources (foreground, background, monochrome if supported) correctly from this reference. Keep the symbol inside the adaptive-icon safe area; avoid stretching or clipping. The PNG is a raster reference, NOT an SVG; do not claim it is vector.

2) MONIVRA_HEADER_LOGO_REFERENCE.png is the reference for the top of the 'More' tab. DO NOT embed this wide image into the UI. Recreate the left symbol in code (e.g. clean SVG paths or an icon component), followed by live text 'Monivra'. Use the same charcoal + teal mark as the launcher icon, and match the screenshot reference composition. The text should remain accessible and scalable.

3) MONIVRA_MORE_SCREEN_BEFORE.jpg shows the current 'More' screen: replace the old dollar-sign icon at top with the new symbol. Replace the black 'Pro' badge with 'Premium' (in the currently selected UI language, e.g. RU 'Премиум', EN 'Premium'). Ensure it fits on narrow phones without clipping. This badge is not evidence that Premium is activated; keep the 'Coming soon' behavior and do not imply an active paid subscription.

4) Android system bars: status bar (clock/signal/battery region) should visually match the app top background; navigation bar should match the bottom background when possible. Set Android native statusBarColor / navigationBarColor and light/dark icon contrast appropriately for current theme, and handle edge-to-edge/insets on modern Android. Avoid a visible color seam or unreadable icons. Check on the real device, not only in browser screenshots.

5) Apply the icon consistently to launcher, splash screen and notifications where appropriate. Notification small icons on Android must be monochrome, transparent and legible; do not use a full-color launcher PNG as a small status-bar icon. Keep the splash screen fast; no artificial wait.

6) Preserve the existing app ID app.monivra.finance.dev, signing key, user data and Android project. Install as an update, not a new app. Test on light and dark themes and with alternate app accent colors; teal/charcoal are the brand mark and should not inherit the chosen UI theme.

7) Please reply to the owner IN RUSSIAN, explain what was changed, and include APK checksum and test results. This package contains references and assets, not a pre-signed APK.
