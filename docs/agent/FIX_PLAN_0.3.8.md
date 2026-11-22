# Fix plan for 0.3.8 (written 2026-11-23 after the owner's report on 0.3.7)

Investigation done by the planning session; this file is the hand-off to the implementing session. Each item says
**what is wrong, the evidence, and the fix**. Do them in the order given (P0 first). Read `docs/AGENTS.md` first;
replies to the owner are in Russian, short, and claim only what was checked.

Context the owner gave: his phone runs the app with an **empty profile** (no operations, empty states on every tab).
He sees: (1) on the first pass through the tabs after launch the bar already shows the new tab while the old screen
stays; some taps are ignored, especially "one step right and immediately back"; after the first pass everything is
fast; (2) budgets ring "passes over" the note instead of through it, the note distorts in some frames and its round
marks do not follow the bending; (3) scheduled-payment number fields: default `0`/`1` is a real value (typing 5 gives
`05`), `∞` disappears late with a jump; (4) scheduled calendar does not feel like shaking; (5) operations paper looks
rough; (6) empty-state animations must replay on every visit of a tab until the person does anything in this launch.

---

## P0-1. Remove the background tab pre-build (it made the first taps 20–50× slower)

- **Where:** `mobile/src/app/(tabs)/_layout.tsx` — the `built` state + timer + `lazy: i >= built` added in 0.3.6.
- **Evidence (CI logs, `origin/mobile-builds`, `builds/N/{perf,paging-weak,paging-usual}/js-log.txt`, first
  `tab press more` → `tab shown more`):** builds 129/130 (before): 40–164 ms. Builds 131/132 (with pre-build):
  perf 1259–2789 ms, weak 2626–2788 ms, usual 289–741 ms. Mounting a whole tab is one synchronous render that
  blocks the JS thread exactly in the seconds after launch when the person starts tapping. The pre-built tabs also
  start their empty-state animations while hidden (see P0-3), so the person never sees them.
- **Fix:** delete the pre-build (back to the navigator's default lazy mounting). Keep `freezeOnBlur: true`.

## P0-2. Tab bar drops a real tap ("ignored first touch", mostly when going back)

- **Where:** `mobile/src/ui/tab-bar.tsx`, `press` and the `useEffect` on `[state.index, state.routes]`.
- **Cause (code reading):** after a press on B, a 1500 ms fallback timer runs. On a slow phone B is still being built
  after 1.5 s, so the timer sets `asked.current` back to the old tab A. If the person now taps A (going back), the
  first check `if (asked.current === route.key) return …"dropped: already asked"` drops the tap. Also, when a slow
  navigation to B commits after the person already asked for A, the effect overwrites `asked.current = B` and clears
  `pressed`, so the pill jumps to B and back.
- **Fix:**
  1. Drop a press only when the tab is both the one asked for **and** the one shown
     (`asked.current === route.key && shown.current.routes[shown.current.index]?.key === route.key`). Navigating to a
     tab that is already the pending target is harmless; never drop because of a stale `asked`.
  2. Remove the 1500 ms timer that rewrites `asked`. If a safety net is wanted, let it only clear the pill
     (`setPressed(null)`) when the navigator has settled on another tab, never touch `asked` while a navigation is
     pending.
  3. In the effect: set `asked.current` from `state` only when no newer target is pending (i.e. when
     `state`'s tab equals `asked.current`, or when nothing was asked); clear `pressed` only when `state` reached
     `pressed`.
  4. Keep the `perfNote` lines (CI reads them).

## P0-3. Empty-state animations: play only while the screen is shown; replay rule; stop on leave

- **Where:** `mobile/src/ui/empty-state.tsx`, `EmptyState` (`firstShown`, `REPLAYS`, `useEffect` that starts
  `Animated.timing` on **mount**).
- **Cause:** the animation starts on mount and keeps running after the tab is left (`freezeOnBlur` freezes React
  rendering, not `Animated` loops — they set native props directly). All animations are JS-driven
  (`useNativeDriver: false`, SVG props). In the empty profile every tab has one (operations 4.95 s, accounts 3 s,
  statistics 2.1 s, categories 1.4 s), so during the first pass the JS thread is busy animating SVG while it must
  build the next tab: the pill moves (cheap) but the screen stays old. Once each picture has played (`firstShown`)
  it never plays again → "after the first pass it is fast". The CI speed check never saw this: its tab moves run
  after restoring 3000 operations (no empty states).
- **Fix:**
  1. Start the timeline only when the screen is focused — use `useFocusEffect` from `expo-router` (already used in
     `features/operations.tsx`; `@react-navigation/native` is not a direct dependency, do not add it) — and only
     after the screen has been drawn: wait two `requestAnimationFrame`s after focus before `start()`, so the tab's
     first frame is not competing with the animation.
  2. On blur (the cleanup of the focus effect): cancel pending frames, `stop()` and `time.setValue(total)` (rest pose).
  3. Replay rule (owner, 2026-11-23): every time the screen becomes focused the picture plays from 0 — **until the
     person does anything in this launch**; after that, pictures are drawn at rest for the rest of the launch. A new
     launch starts again. Implement a tiny module `mobile/src/ui/quiet.ts`: `let quiet = false; export const
     markActed = () => { quiet = true }; export const isQuiet = () => quiet;`. Call `markActed()` from
     `setView` in `features/ui-state.ts` **only when a change was applied** (period swipe, period/day/month choice,
     Expenses/Incomes, filters) and from `appStore().run` in `ui/app-context.tsx` `useCommand` (any command: add,
     edit, delete…). Check the callers of `setView` for programmatic calls at startup/mount (e.g. budgets setting the
     shown month) and make sure those do not count (pass a flag or call `markActed` at the gesture/choice site
     instead). Budgets and Scheduled (separate screens) follow the same rule.
  4. Remove `firstShown`/`REPLAYS` and update the file's header comment.

## P0-4. A CI check that reproduces the owner's case (empty profile, quick tab taps)

- **Where:** `mobile/scripts/emulator-perf.sh`, right after the move "first screen: start with the basic set" (the
  profile is still empty there), before "read the file and open the restore page".
- **Add moves:** "empty: Accounts → Statistics → Accounts (0.3 s)", "empty: Categories → Operations → Categories
  (0.3 s)", "empty: 12 taps in random tab order, 0.25–0.5 s apart" (fixed seed). Tap by coordinates from `where`
  taken once before the move (no `uiautomator dump` inside a measured move).
- **Report:** in `perf-summary.py`, per move: number of `tab press` lines, number of `tab press dropped`, and the
  `tab shown` latencies (p50/p90). Acceptance on the weak profile: 0 dropped presses that were not true repeats,
  p90 press→shown < 200 ms, JS stalls during the moves listed.

## P1-1. Budgets: the ring must go *through* the note (not over it)

- **Where:** `empty-state.tsx`, `Budgets`, `ringArc`, the note path with `fill={c.bg}`.
- **Evidence (reference recording, every crossing of the ring with a note edge, pixel colour at the crossing):**
  top edge crossing at ring angle ≈175° → ring on top; ≈285–290° → note on top; bottom edge ≈85–100° → ring on top;
  ≈355–5° → note on top (0° = right, 90° = down). So the ring's upper-right arc (≈270°→≈5°) is behind the note, the
  rest in front. **Inside the note the ring stays visible**: the reference note is transparent (only its outline
  and marks are painted).
- **What 0.3.6/0.3.7 did wrong:** the note was drawn with an opaque fill (`fill={c.bg}`), which erased the whole back
  quarter inside the note area, leaving flat stubs on the ring; early on, when the back quarter lies outside the
  note, the ring looked laid on top. Owner's phone video (0.3.6) shows both.
- **Fix:** note outline `fill="none"`; draw order: back arc (≈268°→≈7°, slight overlap with the front arc so no
  hairline appears) → note (outline, marks, ellipse) → front arc (≈5°→≈270°). Same stroke, same colour, butt caps at
  the joins. Check against reference frames 36–83 (`vb/` frames, 30 fps).

## P1-2. Budgets: the note must move as one body (marks follow the bending, no broken frames)

- **Reference shape** (rest frame of the recording): a thick wavy frame; the inner contour has **four half-disc
  bulges attached to the edges** (one on the top edge near the top-right corner, one on the right short edge, one on
  the bottom edge near the bottom-left corner, one on the left short edge — 180° symmetric), plus the filled
  ellipse in the middle. Ours draws four free discs near the corners (`noteMarks`, `CORNER_DISC`) and an ellipse from
  separately tracked numbers (`row[17..19]`), so they do not follow the edges.
- **Fix:**
  1. Measure on the reference rest frame (scratch tool, not shipped): for each bulge its edge, its position as the
     curve parameter `u` along that edge, and its radius.
  2. Per frame, build each bulge from the edge itself: points `A = inner(u−δ)`, `B = inner(u+δ)` on the inner side
     of the stroke (edge point + inward normal × stroke/2, normal from the Bézier tangent), path `M A A r r 0 0 s B Z`
     bulging inward. The flat side lies under the stroke. All four bulges in one path string per frame (fixed command
     structure so `interpolate` can blend frames).
  3. Ellipse: centre = middle of the note (mean of the two long edges at `u = 0.5`), angle = direction of the
     midline tangent at `u = 0.5` + the rest-frame offset. Drop the tracked ellipse columns.
  4. Smooth `NOTE_FRAMES` over time (Savitzky–Golay, 5–7 frames) and reject/repair frames where a long edge has a
     kink (curvature sign changes twice, or control points cross) — these are the "distorted frames". Regenerate
     `budget-motion.ts` with the generator script and keep the script in `mobile/scripts/` (documented).

## P1-3. Scheduled-payment number fields: defaults are placeholders, ∞ without a jump

- **Where:** `features/editor/options.tsx`, `Stepper` (0.3.7) and its three callers (Repeat every, Number of
  repetitions, Before).
- **Cause:** the TextInput shows the real value; on focus `setDraft` is set one render later, so `∞` disappears late
  (and visibly late while the keyboard animates); a default `0`/`1` is real text, typing appends (`05`).
- **Fix:** give `Stepper` `value` (string, `""` when the value is the default: every = 1, before = 0, remaining =
  `null`) and `placeholder` (`"1"`, `"0"`, `"∞"`). The TextInput gets `value={value}` and `placeholder` with
  `placeholderTextColor` = ink when not focused (looks like a value) and muted when focused (a hint). No state change
  on focus → nothing jumps. A value the person set (≠ default) stays real text, caret after it (`selection` at end
  on focus only — set it once in `onFocus`, do not keep `selection` controlled while typing). Strip leading zeros.
  Empty on blur = default. Arrows keep working on the real number.

## P1-4. Scheduled calendar: a shake, not a slow rocking

- **Where:** `empty-state.tsx`, `Scheduled` (`SWING`, pivot on the bottom edge, period ≈0.8 s copied from the old
  app's recording). The owner wants "like shaking a phone": two bursts, each dying down. Fix the *motion shape*
  first, then tune speed with him.
- **Fix:** rotate about the calendar's own centre (≈ x 241, y 263 in the viewBox), fast alternation and a decaying
  envelope: burst 1 (≈70 ms per half swing): 0, +12, −11, +9, −7, +5, −3, +1.5, 0; pause ≈250 ms; burst 2 at ~60 %:
  +7, −6, +4.5, −3, +2, −1, 0. Optional ±3 px horizontal shift in phase. Total ≈1.4 s. Run it on the native driver
  (P2-1) — a fast shake needs every frame; JS-driven frames drop on weak phones and make it mushy.

## P2-1. Move transform/opacity animations off the JS thread (native driver)

- **Why:** JS-driven SVG animation costs JS time every frame on every device; on weak phones it competes with
  navigation (P0-3). No new packages are needed: `Animated` with `useNativeDriver: true` supports `transform`
  (translate, rotate, scale) and `opacity` on `Animated.View`, with `transformOrigin` (RN ≥ 0.73).
- **How:** split each picture into layers: static `Svg` parts inside absolutely positioned `Animated.View`s of the
  same size, and animate the views. Candidates: scheduled calendar (P1-4), notification bell
  (`features/notification-ask.tsx`, rotate about the top hanger, `transformOrigin` at the hanger), operations lens
  (translate + rotate + scale; cross scale in a nested view), statistics bars (`scaleY` with `transformOrigin`
  bottom; star scale/opacity), budgets ring position/size (keep its arcs as Svg in a view that moves/scales only if
  the layering of P1-1 can be kept; otherwise leave budgets JS-driven — it is a separate screen). Leave on JS only
  what changes path geometry (budgets note morph, stroke-dash drawing of lines/arrow).
- Measure before/after with P0-4 (JS stalls during the empty-state moves).

## Not a bug: operations paper shape

- Compared the owner's phone frame (0.3.6) with the reference recording frame, same crop, pixel by pixel: mean
  difference 0.54/255, **no pixel differs by more than 40/255**. The paper (curls, corners) is identical to the old
  application. If the owner wants a paper *nicer than the original* (bottom curl rolled toward the viewer, top curl
  away, soft shading, no visible joins), that is a redraw: ask him to confirm before doing it.
- The lens shows "+" while scanning: the reference does the same (the lens turns ≈−32°); timing already follows the
  measured keys.

## Order, checks, release

1. P0-1, P0-2, P0-3 (+ P0-4 in the same push, so CI measures it), then P1-1…P1-4, then P2-1.
2. Local: `npm test`, `node scripts/check-boundaries.mjs`, type check. Version 0.3.8 in `mobile/package.json`,
   section in `docs/architecture/MIGRATION_STATUS.md` (cause → fix per item, what was verified where).
3. Push `rn-migration`, wait for CI **to the end** and report to the owner the moment it finishes (he waited for
   nothing once). Look at the smoke screenshots (`15m-*-moving-*`, `15a2-recur-window`, `15a3-reminder-window`) and
   the new empty-profile tab numbers before sending the APK.
