import { beforeEach, describe, expect, it, vi } from "vitest";
const logged = vi.hoisted(() => vi.fn());
vi.mock("pino", () => ({ default: () => ({ info: logged }) }));
import { logOperationalEvent } from "@/platform/observability/logger";
beforeEach(() => logged.mockClear());
describe("private operational diagnostics", () => {
  it("allows fixed codes and bounded request correlation", () => {
    const requestId = "d099d83b-e11e-473e-bf52-31bf05817b2c";
    logOperationalEvent("database_idle_error", { requestId });
    expect(logged).toHaveBeenCalledWith({
      event: "database_idle_error",
      requestId,
    });
  });
  it("rejects arbitrary error/provider/request payloads before any logging", () => {
    expect(() =>
      logOperationalEvent("worker_error", {
        error: "bearer-secret",
        url: "postgresql://secret",
        recipient: "private@example.test",
      } as never),
    ).toThrow();
    expect(() =>
      logOperationalEvent("arbitrary raw exception" as never),
    ).toThrow();
    expect(logged).not.toHaveBeenCalled();
  });
});
