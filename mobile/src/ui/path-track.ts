// Path strings that share one command structure, blended by time from numbers parsed once (no regular expression and no
// string interpolation per frame: Animated's string interpolation re-reads every number of every path on every tick).
// `track(t)` is the path at time t (ms), holding the first and the last string outside the times.
export type Track = (t: number) => string;

const NUMBER = /-?\d+(?:\.\d+)?/g;

export function pathTrack(times: ReadonlyArray<number>, paths: ReadonlyArray<string>): Track {
  const pieces = paths[0]!.split(NUMBER);
  const rows = paths.map((path) => {
    const numbers = (path.match(NUMBER) ?? []).map(Number);
    if (numbers.length !== pieces.length - 1) throw new Error("the paths of a track differ in structure");
    return Float64Array.from(numbers);
  });
  const count = rows[0]!.length;
  let at = 0; // the stretch the last call was in: time moves forward, so the next one is usually the same or the next
  return (t) => {
    const last = times.length - 1;
    if (t <= times[0]!) return paths[0]!;
    if (t >= times[last]!) return paths[last]!;
    if (!(times[at]! <= t && t < times[at + 1]!)) {
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid]! <= t) lo = mid;
        else hi = mid;
      }
      at = lo;
    }
    const a = rows[at]!;
    const b = rows[at + 1]!;
    const f = (t - times[at]!) / (times[at + 1]! - times[at]!);
    let text = pieces[0]!;
    for (let i = 0; i < count; i++) text += (+(a[i]! + (b[i]! - a[i]!) * f).toFixed(2)).toString() + pieces[i + 1]!;
    return text;
  };
}

// A number that follows the rows [time, value] linearly (the thickness of the ring).
export function numberTrack(times: ReadonlyArray<number>, values: ReadonlyArray<number>): (t: number) => number {
  let at = 0;
  return (t) => {
    const last = times.length - 1;
    if (t <= times[0]!) return values[0]!;
    if (t >= times[last]!) return values[last]!;
    if (!(times[at]! <= t && t < times[at + 1]!)) {
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid]! <= t) lo = mid;
        else hi = mid;
      }
      at = lo;
    }
    return values[at]! + (values[at + 1]! - values[at]!) * ((t - times[at]!) / (times[at + 1]! - times[at]!));
  };
}
