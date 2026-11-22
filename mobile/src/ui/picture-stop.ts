// A press on a tab stops the empty-state pictures at once, not when the old screen blurs (which is only after the new tab
// has been built: the picture kept the JavaScript thread busy exactly then, CI build 133, twelve quick taps).
const stops = new Set<() => void>();
export const onPictureStop = (stop: () => void): (() => void) => {
  stops.add(stop);
  return () => void stops.delete(stop);
};
export const stopPictures = (): void => {
  for (const stop of [...stops]) stop();
};
