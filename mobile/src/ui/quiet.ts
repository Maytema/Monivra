// The empty-state pictures (ui/empty-state.tsx): every screen plays on its first visit in a launch. Until the person does
// something (changes the period or a filter, adds, edits or deletes anything) a picture replays at every visit; after
// that, screens already seen show the rest frame and screens not yet seen still play once. A new launch starts again.
// Programmatic changes (a page putting its own period in place) do not count as the person acting.
let quiet = false;
const played = new Set<string>();
export const markActed = (): void => {
  quiet = true;
};
export const isQuiet = (): boolean => quiet;
// Whether the picture of `kind` should play at this visit, and the note that it has started.
export const shouldPlay = (kind: string): boolean => !quiet || !played.has(kind);
export const markPlayed = (kind: string): void => {
  played.add(kind);
};
