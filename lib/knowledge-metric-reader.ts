import { ApiError, errorMessage } from "./api.ts";
import { KnowledgeContractError, type PaintingMetricPage, type PaintingMetricQuery } from "./knowledge-contracts.ts";

export type MetricReadState = { data: PaintingMetricPage | null; loading: boolean; error: string | null };
type Loader = (query: PaintingMetricQuery, signal: AbortSignal) => Promise<PaintingMetricPage>;

/** A superseded search, page, or login can never publish data or sign out a newer account. */
export class KnowledgeMetricReader {
  private request: AbortController | null = null;
  private disposed = false;

  constructor(
    private readonly loader: Loader,
    private readonly isCurrent: () => boolean,
    private readonly publish: (state: MetricReadState) => void,
    private readonly unauthorized: () => void,
  ) {}

  async read(query: PaintingMetricQuery): Promise<void> {
    this.request?.abort();
    if (this.disposed || !this.isCurrent()) return;
    const request = new AbortController();
    this.request = request;
    const current = () => !this.disposed && !request.signal.aborted && this.request === request && this.isCurrent();
    this.publish({ data: null, loading: true, error: null });
    try {
      let data: PaintingMetricPage;
      try { data = await this.loader(query, request.signal); }
      catch (error) {
        // A changed aggregate starts at its first page instead of joining two revisions.
        if (!current() || !(error instanceof ApiError) || error.status !== 409 || !query.revision) throw error;
        data = await this.loader({ ...query, page: 0, revision: undefined }, request.signal);
      }
      if (current() && data.totalPages > 0 && data.page >= data.totalPages) {
        data = await this.loader({ ...query, page: 0, revision: data.revision }, request.signal);
      }
      if (current()) this.publish({ data, loading: false, error: null });
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiError && error.kind === "unauthorized") { this.unauthorized(); return; }
      this.publish({ data: null, loading: false, error: error instanceof KnowledgeContractError ? error.message : errorMessage(error) });
    }
  }

  dispose() { this.disposed = true; this.request?.abort(); }
}
