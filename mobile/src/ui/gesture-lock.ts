// While an item is lifted for reordering, sideways swipes of the screen must not take the touch.
let held = false;
export const gestureLock = {
  get held(): boolean {
    return held;
  },
  set(value: boolean): void {
    held = value;
  },
};
