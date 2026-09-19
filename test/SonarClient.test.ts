import { describe, it, expect, vi, beforeEach } from "vitest";
import { SonarClient } from "../src/modules/SonarClient.js";

describe("SonarClient - Connection Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully verify connection when SonarQube returns valid authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });

    const client = new SonarClient({
      serverUrl: "http://localhost:9000",
      token: "test-token-123",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9000/api/authentication/validate",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("test-token-123:").toString("base64")}`,
        }),
      })
    );
  });

  it("should fail verification when authentication is invalid (401)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ msg: "Invalid credentials" }] }),
    });

    const client = new SonarClient({
      serverUrl: "http://localhost:9000",
      token: "invalid-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Authentication failed (HTTP 401)");
  });

  it("should fail verification when server is unreachable or URL is invalid", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new SonarClient({
      serverUrl: "http://unreachable-host:9000",
      token: "some-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Cannot reach SonarQube server");
  });
});
