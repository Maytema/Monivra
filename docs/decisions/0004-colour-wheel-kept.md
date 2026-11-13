# 0004 — The colour page keeps the wheel

**Decision (owner, 2026-11-12).** The colour page keeps the wheel (a ring of hues with a square turned 45°
inside, `ui/color-wheel.tsx`) instead of the reference's grid of tiles. Under the wheel there is one row of
shades of the chosen colour — as many as fit the width (`ui/color-tools.ts prettyShades`, `shadeRow`) — and
the HEX field, whose `#` is outside the field so it cannot be deleted; an unfinished code goes back to the
last valid colour.

**Why.** The owner prefers the wheel ("у нас красивые… не делать сетку") and asked for the row of quick colours
to go and for safe manual input.
