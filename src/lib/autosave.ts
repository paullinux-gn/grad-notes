/**
 * Debounced, merged writes: callers apply a change locally right away and
 * queue it here; patches for the same id are merged and sent together.
 */
export class Autosave<P extends object, R = unknown> {
  #pending = new Map<string, P>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #chain: Promise<void> = Promise.resolve();

  constructor(
    private send: (id: string, patch: P) => Promise<R>,
    private onSaved: (id: string, result: R, patch: P) => void,
    private onError: (id: string, e: unknown) => void,
    private delay = 400,
  ) {}

  queue(id: string, patch: P, immediate = false) {
    this.#pending.set(id, { ...this.#pending.get(id), ...patch });
    clearTimeout(this.#timer);
    if (immediate) void this.flush();
    else this.#timer = setTimeout(() => void this.flush(), this.delay);
  }

  /** True while a change to `id` hasn't been sent yet. */
  has(id: string): boolean {
    return this.#pending.has(id);
  }

  /** Drops unsent changes (the item is being deleted). */
  forget(id: string) {
    this.#pending.delete(id);
  }

  flush(): Promise<void> {
    clearTimeout(this.#timer);
    if (this.#pending.size === 0) return this.#chain;
    const batch = [...this.#pending];
    this.#pending.clear();
    this.#chain = this.#chain.then(async () => {
      for (const [id, patch] of batch) {
        try {
          this.onSaved(id, await this.send(id, patch), patch);
        } catch (e) {
          this.onError(id, e);
        }
      }
    });
    return this.#chain;
  }
}
