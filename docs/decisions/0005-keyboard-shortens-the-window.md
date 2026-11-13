# 0005 — The keyboard shortens the whole window

**Decision.** One `KeyboardAvoidingView` at the root (`app/_layout.tsx`) around the screens and the layer
host: every page, sheet and dialog ends above the keyboard, as the first application's `adjustResize` did.
Sheets have no keyboard view of their own (it would count the keyboard twice). A page with a field at its
end brings it up when focused (example: the HEX field of the colour page).

**Why.** The owner found a field under the keyboard and asked for it to be fixed everywhere; Android with
edge-to-edge does not resize the window by itself.
