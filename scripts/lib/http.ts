// No constructor parameter properties: Node's built-in TypeScript stripping does not support them.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with timeout and bounded retries (exponential backoff + jitter) on transient failures only.
 * 4xx other than 408/429 are never retried: they cost quota and won't fix themselves.
 */
export async function getWithRetry(
  url: string,
  init: RequestInit = {},
  { attempts = 3, timeoutMs = 15_000, baseDelayMs = 1_000, fetchImpl = fetch } = {},
): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(baseDelayMs * 2 ** (i - 1) * (0.75 + Math.random() * 0.5));
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      last = new HttpError(res.status, `HTTP ${res.status} sur ${new URL(url).pathname}`);
      if (!RETRYABLE.has(res.status)) break;
    } catch (e) {
      last = e; // network error or timeout
    }
  }
  throw last;
}
