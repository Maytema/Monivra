// The empty-state pictures play at every visit of their screen until the person does something in this launch (changes
// the period or a filter, adds, edits or deletes anything); after that they are drawn at rest for the rest of the launch.
// A new launch starts again. Programmatic changes (a page putting its own period in place) do not count.
// The speed-check build (the emulator legs of CI) never goes quiet: its tours do many things before they look at a picture,
// and the screenshots of the moving pictures and the empty-profile tab moves must see them play.
let quiet = false;
export const markActed = (): void => {
  quiet = true;
};
export const isQuiet = (): boolean => quiet && process.env.EXPO_PUBLIC_PERF !== "1";
