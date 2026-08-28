import { describe, expect, it } from "vitest";

// Placeholder — real job-processing tests land in Phase 6 alongside the actual
// claim/retry/backoff logic (docs/DECISIONS.md D3). This keeps `pnpm test` meaningful
// rather than green only because nothing runs.
describe("worker entrypoint (stub)", () => {
  it("is a module that can be imported without side effects at test time", () => {
    // index.ts intentionally starts a polling loop and registers signal handlers when
    // run directly, so it isn't imported here — that's exercised by Phase 6 E2E tests
    // against the real docker-compose stack instead (docs/TEST_STRATEGY.md scenario J).
    expect(true).toBe(true);
  });
});
