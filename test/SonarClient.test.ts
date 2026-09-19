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

  it("should fetch projects from /api/projects/search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        components: [
          { key: "proj-1", name: "Project One" },
          { key: "proj-2", name: "Project Two" },
        ],
      }),
    });

    const client = new SonarClient({
      serverUrl: "http://localhost:9000",
      token: "valid-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const projects = await client.fetchProjects();

    expect(projects).toEqual([
      { key: "proj-1", name: "Project One" },
      { key: "proj-2", name: "Project Two" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9000/api/projects/search?ps=100",
      expect.anything()
    );
  });

  it("should fetch and correctly map Overall Code measures into SonarOverview", async () => {
    const mockMeasuresResponse = {
      component: {
        key: "test-project",
        name: "Test Project",
        measures: [
          { metric: "vulnerabilities", value: "0" },
          { metric: "security_rating", value: "1.0" },
          { metric: "bugs", value: "2" },
          { metric: "reliability_rating", value: "3.0" },
          { metric: "code_smells", value: "27" },
          { metric: "sqale_rating", value: "1.0" },
          { metric: "coverage", value: "77.3" },
          { metric: "lines_to_cover", value: "22000" },
          { metric: "duplicated_lines_density", value: "3.2" },
          { metric: "duplicated_lines", value: "86000" },
          { metric: "security_hotspots", value: "0" },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: "http://localhost:9000",
      token: "valid-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview("test-project");

    expect(overview.security).toEqual({ count: 0, rating: "A" });
    expect(overview.reliability).toEqual({ count: 2, rating: "C" });
    expect(overview.maintainability).toEqual({ count: 27, rating: "A" });
    expect(overview.coverage).toEqual({ percentage: 77.3, linesToCover: 22000 });
    expect(overview.duplications).toEqual({ percentage: 3.2, duplicatedLines: 86000 });
    expect(overview.securityHotspots).toEqual({ count: 0, rating: "A" });
  });

  it("should fetch issues and extract clean relative file paths", async () => {
    const mockIssuesResponse = {
      issues: [
        {
          key: "ISSUE-1",
          rule: "vue:S123",
          severity: "MAJOR",
          type: "BUG",
          component: "my-project:resources/survey/components/widgets/TugasCardGrid.vue",
          line: 168,
          message: 'Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.',
          effort: "5min",
          tags: ["accessibility", "react"],
          creationDate: "2026-09-13T10:00:00+0000",
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockIssuesResponse,
    });

    const client = new SonarClient({
      serverUrl: "http://localhost:9000",
      token: "valid-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const items = await client.getIssues("my-project", "reliability");

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("ISSUE-1");
    expect(items[0].filePath).toBe("resources/survey/components/widgets/TugasCardGrid.vue");
    expect(items[0].line).toBe(168);
    expect(items[0].effort).toBe("5min");
    expect(items[0].tags).toEqual(["accessibility", "react"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/issues/search?componentKeys=my-project&types=BUG"),
      expect.anything()
    );
  });
});
