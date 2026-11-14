// The pages of a report as pictures for the preview, made a few at a time by the phone (the PDF drawn by the
// system's renderer, off the JavaScript thread). The first pages are made while the person waits behind the
// progress dialog; the rest go on in the background, also after the preview is closed, so scrolling never
// waits and opening the preview again is at once. `render` is the phone's renderer: pages [from, from+count)
// as picture addresses.
export type RenderPages = (from: number, count: number) => Promise<string[]>;

// How many pages each call to the renderer makes in the background: small, so a stop is quick.
const BATCH = 2;

export class PageImages {
  readonly total: number;
  readonly uris: (string | undefined)[];
  private readonly render: RenderPages;
  private readonly listeners = new Set<() => void>();
  private running = false;
  private halted = false;

  constructor(total: number, render: RenderPages) {
    this.total = total;
    this.render = render;
    this.uris = Array<string | undefined>(total).fill(undefined);
  }

  // How many pages are ready, counted from the first one.
  get ready(): number {
    const missing = this.uris.indexOf(undefined);
    return missing === -1 ? this.total : missing;
  }

  // Stopped pictures are not to be shown again: their files may be deleted.
  get stopped(): boolean {
    return this.halted;
  }

  get done(): boolean {
    return this.ready === this.total;
  }

  // Told after every new batch of pages; returns the way to stop listening.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // The next `count` missing pages; false when there was nothing left or the work was stopped.
  private async next(count: number): Promise<boolean> {
    const from = this.ready;
    if (this.halted || from >= this.total) return false;
    const made = await this.render(from, Math.min(count, this.total - from));
    if (this.halted) return false;
    if (!made.length) throw new Error("No page was made");
    made.forEach((uri, i) => (this.uris[from + i] = uri));
    this.listeners.forEach((l) => l());
    return true;
  }

  // The first `count` pages, saying after each batch how many are ready (behind the progress dialog).
  async first(count: number, say: (ready: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const want = Math.min(count, this.total);
    while (this.ready < want) {
      if (signal?.aborted) throw new Error("Stopped");
      if (!(await this.next(Math.min(BATCH, want - this.ready)))) return;
      say(this.ready, this.total);
    }
  }

  // The remaining pages, one batch after another, until all are made or the work is stopped. A failure stops
  // the background work quietly: the pages not made show as waiting, and the file itself is not affected.
  continueInBackground(): void {
    if (this.running || this.halted) return;
    this.running = true;
    void (async () => {
      try {
        while (await this.next(BATCH)) {
          // The renderer works off the JavaScript thread; between batches the application answers touches.
        }
      } catch {
        // see above
      } finally {
        this.running = false;
      }
    })();
  }

  // The data or the settings changed: these pictures are no longer wanted.
  stop(): void {
    this.halted = true;
    this.listeners.clear();
  }
}
