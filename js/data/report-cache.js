/* The prepared exports of this session. A PDF of a long report takes a while to make, so the one made
   for the choices of the person is kept and used again by Preview, Save, Share and Print; asking for
   it while it is being made waits for that one instead of starting another. Only a few are kept (the
   pictures of the pages are the heavy part) and the oldest is let go first. An entry is thrown away
   when anything it was made from changes: the data (every save counts), the day, the language, or any
   choice of the export (mode, period, filters, parts or sections). Nothing is stored on the device. */
import { appData } from "../core/state.js";
import { today } from "../core/constants.js";
import { dataRevision } from "./storage.js";
import { buildCsvJob, buildReportJob, releaseJob } from "./report-job.js";

export const CACHE_LIMIT = 3;
const entries = new Map(); // signature -> { revision, job, pending, listeners }
export const cacheStats = { hits: 0, joined: 0, builds: 0 };

// Only the choices that change this kind of file count: a summary is made of sections, the others of
// fields. The rest of what the page remembers does not make a new file.
const relevant = ({ mode, filters, period, sections, parts }) =>
  mode === "summary" ? { mode, filters, period, sections } : { mode, filters, period, parts };
const versionOf = () => `${dataRevision()}|${today()}|${appData.settings.language}`;
export const signatureOf = (config) => JSON.stringify([versionOf(), relevant(config)]);

// Lets go of what no longer matches the data.
function dropStale() {
  const now = versionOf();
  for (const [key, entry] of entries)
    if (!entry.pending && entry.version !== now) {
      releaseJob(entry.job);
      entries.delete(key);
    }
}

// The prepared export for these choices, when there is one (not one still being made).
export function readyJob(config) {
  dropStale();
  const entry = entries.get(signatureOf(config));
  return entry?.job ?? null;
}
// True while a PDF for these choices is being made.
export const isPreparing = (config) => Boolean(entries.get(signatureOf(config))?.pending);

// Resolves with the prepared export for these choices, making it only when it does not exist yet.
// `onPage(done, total)` tells the progress of a PDF; everyone waiting for the same one is told.
export function preparedJob(config, onPage = () => {}) {
  dropStale();
  const key = signatureOf(config);
  const known = entries.get(key);
  if (known?.job) {
    cacheStats.hits++;
    entries.delete(key);
    entries.set(key, known); // most recently used
    return Promise.resolve(known.job);
  }
  if (known?.pending) {
    cacheStats.joined++;
    known.listeners.add(onPage);
    return known.pending;
  }
  cacheStats.builds++;
  const entry = { version: versionOf(), job: null, listeners: new Set([onPage]), pending: null };
  entry.pending = (async () => {
    await null; // always asynchronous, so that `pending` is set before anything finishes
    try {
      const job =
        config.mode === "csv"
          ? buildCsvJob(config)
          : await buildReportJob(config, (done, total) =>
              entry.listeners.forEach((listener) => listener(done, total)),
            );
      entry.job = job;
      return job;
    } catch (error) {
      entries.delete(key);
      throw error;
    } finally {
      entry.pending = null;
    }
  })();
  entries.set(key, entry);
  entry.pending.then(
    () => {
      while ([...entries.values()].filter((e) => e.job).length > CACHE_LIMIT) {
        const [oldKey, old] = [...entries].find(([, e]) => e.job);
        releaseJob(old.job);
        entries.delete(oldKey);
      }
    },
    () => {},
  );
  return entry.pending;
}

// Lets go of everything (when the data is replaced or erased).
export function clearJobs() {
  for (const entry of entries.values()) releaseJob(entry.job);
  entries.clear();
}
