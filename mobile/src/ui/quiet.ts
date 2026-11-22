// The empty-state pictures play at every visit of their screen until the person does something in this launch (changes
// the period or a filter, adds, edits or deletes anything); after that they are drawn at rest for the rest of the launch.
// A new launch starts again. Programmatic changes (a page putting its own period in place) do not count.
let quiet = false;
export const markActed = (): void => {
  quiet = true;
};
export const isQuiet = (): boolean => quiet;
