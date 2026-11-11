// What a command needs from the outside world: the time and new identifiers.
import { systemClock, type Clock } from "./dates.ts";
import { uuidv7 } from "../shared/ids.ts";

export interface Env {
  clock: Clock;
  newId: () => string;
}

export const systemEnv: Env = { clock: systemClock, newId: () => uuidv7() };
