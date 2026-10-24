import { describe, expect, it, vi } from "vitest";
import { getWithRetry } from "../../scripts/lib/http";
import { oddsApi } from "../../scripts/lib/odds-api";
import { pickReferenceBookmaker } from "../../scripts/lib/ingest";

const res = (status: number, body: unknown = [], headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("getWithRetry", () => {
  it("retries transient errors then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockRejectedValueOnce(new Error("socket")).mockResolvedValueOnce(res(200));
    const r = await getWithRetry("https://x.test/a", {}, { fetchImpl: f, baseDelayMs: 1 });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("never retries a client error and gives up after the attempt budget", async () => {
    const unauthorized = vi.fn().mockResolvedValue(res(401));
    await expect(getWithRetry("https://x.test/a", {}, { fetchImpl: unauthorized, baseDelayMs: 1 })).rejects.toThrow("HTTP 401");
    expect(unauthorized).toHaveBeenCalledTimes(1);
    const down = vi.fn().mockResolvedValue(res(503));
    await expect(getWithRetry("https://x.test/a", {}, { fetchImpl: down, baseDelayMs: 1 })).rejects.toThrow("HTTP 503");
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("keeps the API key out of error messages", async () => {
    const f = vi.fn().mockResolvedValue(res(401));
    await expect(getWithRetry("https://x.test/odds?apiKey=SECRET", {}, { fetchImpl: f })).rejects.not.toThrow(/SECRET/);
  });
});

describe("oddsApi", () => {
  it("validates the payload and reads credit headers", async () => {
    const f = vi.fn().mockResolvedValue(res(200, [], { "x-requests-last": "1", "x-requests-remaining": "487" }));
    const r = await oddsApi("k".repeat(32), f)("soccer_epl");
    expect(r).toEqual({ events: [], creditsUsed: 1, creditsRemaining: 487 });
    expect(String(f.mock.calls[0][0])).toContain("regions=eu&markets=h2h");
  });

  it("rejects an unexpected payload instead of storing it", async () => {
    const f = vi.fn().mockResolvedValue(res(200, [{ id: 1 }]));
    await expect(oddsApi("k".repeat(32), f)("soccer_epl")).rejects.toThrow(/inattendue/);
  });
});

describe("pickReferenceBookmaker", () => {
  it("prefers sharp books, else the first alphabetically", () => {
    expect(pickReferenceBookmaker(["unibet_eu", "pinnacle"])).toBe("pinnacle");
    expect(pickReferenceBookmaker(["zbet", "abet"])).toBe("abet");
    expect(pickReferenceBookmaker([])).toBeNull();
  });
});
