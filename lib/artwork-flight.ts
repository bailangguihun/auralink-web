/** A single, short-lived copy of public information already visible to the user.
 * It supplies a picture while the authenticated detail read is still pending;
 * it never supplies permissions, favorites or private detail data.
 */
export type ArtworkPreview = {
  paintingId: string; generation: number; source: string;
  title: string; author: string; period: string;
  width: number; height: number; savedAt: number;
};

let preview: ArtworkPreview | null = null;
let flight: { path: string; generation: number; finish: () => void; listeners: Set<() => void> } | null = null;

export function saveArtworkPreview(value: ArtworkPreview) { preview = value; }
export function clearArtworkPreview() { preview = null; }
export function getArtworkPreview(paintingId: string, generation: number): ArtworkPreview | null {
  return preview?.paintingId === paintingId && preview.generation === generation
    && Date.now() - preview.savedAt < 20 * 60_000 ? preview : null;
}

/** Only the first image flight defers detail reads. Slow routing/landing cannot
 * extend this gate. Finishing, cancelling or replacing a flight releases it.
 */
export function beginArtworkFlight(path: string, generation: number): () => void {
  flight?.finish();
  const entry = { path, generation, listeners: new Set<() => void>(), finish: () => {} };
  entry.finish = () => {
    if (flight === entry) flight = null;
    for (const listener of entry.listeners) listener();
    entry.listeners.clear();
  };
  flight = entry;
  return entry.finish;
}

export function waitForArtworkFlight(path: string, generation: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("The read was cancelled.", "AbortError"));
  const entry = flight;
  if (!entry || entry.path !== path || entry.generation !== generation) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); entry.listeners.delete(finish); resolve(); };
    const abort = () => { signal?.removeEventListener("abort", abort); entry.listeners.delete(finish); reject(new DOMException("The read was cancelled.", "AbortError")); };
    entry.listeners.add(finish);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
