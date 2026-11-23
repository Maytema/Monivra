// Keys of a picture's motion: [time ms, value, easing?]; the easing, when given, shapes the stretch that ends at that key. They
// are expanded once into plain arrays (the easing sampled in 10 steps), which both drivers (Animated interpolation and the
// Reanimated worklets of driven-pictures.tsx) read the same way: the value holds before the first key and after the last.
export type Ease = (n: number) => number;
export type Key = readonly [number, number, Ease?];
export interface Spec {
  input: number[];
  output: number[];
}

export function expand(keys: ReadonlyArray<Key>): Spec {
  const input: number[] = [];
  const output: number[] = [];
  keys.forEach((key, i) => {
    if (i === 0) {
      input.push(key[0]);
      output.push(key[1]);
      return;
    }
    const prev = keys[i - 1]!;
    const steps = key[2] ? 10 : 1;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      input.push(prev[0] + (key[0] - prev[0]) * f);
      output.push(prev[1] + (key[1] - prev[1]) * (key[2] ? key[2](f) : f));
    }
  });
  return { input, output };
}

// What the worklets compute, in plain JS (for the tests): linear between the points, clamped at both ends.
export function valueAt(spec: Spec, t: number): number {
  const { input, output } = spec;
  if (t <= input[0]!) return output[0]!;
  const last = input.length - 1;
  if (t >= input[last]!) return output[last]!;
  let i = 0;
  while (input[i + 1]! <= t) i++;
  return output[i]! + (output[i + 1]! - output[i]!) * ((t - input[i]!) / (input[i + 1]! - input[i]!));
}
