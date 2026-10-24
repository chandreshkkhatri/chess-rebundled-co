export interface EngineSearch {
  fen: string;
  depth: number;
  skillLevel?: number;
  moveTime?: number;
  signal?: AbortSignal;
}

interface SearchResult { move: string; score: number }

interface PendingSearch {
  options: EngineSearch;
  resolve: (result: SearchResult) => void;
  reject: (error: Error) => void;
  score: number;
  cancelled: boolean;
  removeAbortListener: () => void;
}

const abortError = () => new DOMException('Engine search cancelled', 'AbortError');

/** One message handler owns the worker; searches are queued until bestmove. */
export class StockfishClient {
  private queue: PendingSearch[] = [];
  private active: PendingSearch | null = null;
  private ready = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private worker: Worker, private onReady: (ready: boolean) => void) {
    worker.onmessage = event => this.receive(String(event.data));
    worker.onerror = () => this.fail(new Error('Stockfish worker failed'));
    worker.onmessageerror = () => this.fail(new Error('Invalid Stockfish worker message'));
    this.armTimeout();
    try { worker.postMessage('uci'); }
    catch { this.fail(new Error('Unable to start Stockfish')); }
  }

  search(options: EngineSearch): Promise<SearchResult> {
    if (this.closed) return Promise.reject(new Error('Stockfish is unavailable'));
    if (options.signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const request: PendingSearch = {
        options, resolve, reject, score: 0, cancelled: false,
        removeAbortListener: () => options.signal?.removeEventListener('abort', cancel),
      };
      const cancel = () => {
        request.cancelled = true;
        request.removeAbortListener();
        reject(abortError());
        if (this.active === request) {
          // Drain this search's bestmove before starting the next search.
          try { this.worker.postMessage('stop'); }
          catch { this.fail(new Error('Unable to stop Stockfish')); }
        } else {
          this.queue = this.queue.filter(item => item !== request);
        }
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      this.queue.push(request);
      this.pump();
    });
  }

  dispose(): void { this.fail(abortError()); }

  private armTimeout(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(new Error('Stockfish request timed out')), 30_000);
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    clearTimeout(this.timer);
    for (const request of [...(this.active ? [this.active] : []), ...this.queue]) {
      request.removeAbortListener();
      request.reject(error);
    }
    this.active = null;
    this.queue = [];
    this.worker.terminate();
    this.onReady(false);
  }

  private pump(): void {
    if (!this.ready || this.closed || this.active || this.queue.length === 0) return;
    const request = this.queue.shift()!;
    this.active = request;
    this.armTimeout();
    const { fen, depth, skillLevel, moveTime } = request.options;
    try {
      this.worker.postMessage(`setoption name Skill Level value ${skillLevel ?? 20}`);
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}${moveTime ? ` movetime ${moveTime}` : ''}`);
    } catch { this.fail(new Error('Unable to send Stockfish search')); }
  }

  private receive(message: string): void {
    if (this.closed) return;
    if (message === 'uciok') {
      try { this.worker.postMessage('isready'); }
      catch { this.fail(new Error('Unable to initialize Stockfish')); }
      return;
    }
    if (message === 'readyok' && !this.ready) {
      clearTimeout(this.timer);
      this.ready = true;
      this.onReady(true);
      this.pump();
      return;
    }
    const request = this.active;
    if (!request) return;
    const score = message.match(/\bscore (cp|mate) (-?\d+)/);
    if (score) {
      const value = Number(score[2]);
      const centipawns = score[1] === 'cp' ? value : value > 0 ? 10000 - value : -10000 - value;
      request.score = request.options.fen.split(' ')[1] === 'w' ? centipawns : -centipawns;
    }
    if (message.startsWith('bestmove ')) {
      clearTimeout(this.timer);
      this.active = null;
      request.removeAbortListener();
      if (!request.cancelled) request.resolve({ move: message.split(' ')[1], score: request.score });
      this.pump();
    }
  }
}
