// A press on a tab stops the empty-state pictures at once, not when the old screen blurs (which is only after the new tab
// has been built: the picture kept the JavaScript thread busy exactly then, CI build 133, twelve quick taps). A press on a tab
// leaves the picture where it is (no jump to the finished frame; the screen goes back to its first frame when it is left);
// a sheet opening over the screen (`finish`) puts the picture at rest, at its last frame.
const stops = new Set<(finish: boolean) => void>();
export const onPictureStop = (stop: (finish: boolean) => void): (() => void) => {
  stops.add(stop);
  return () => void stops.delete(stop);
};
export const stopPictures = (finish = false): void => {
  for (const stop of [...stops]) stop(finish);
};
