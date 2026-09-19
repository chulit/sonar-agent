export interface SonarClientConfig {
  serverUrl: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export interface VerificationResult {
  ok: boolean;
  message?: string;
}

export type SonarRating = "A" | "B" | "C" | "D" | "E";

export interface SonarOverview {
  security: { count: number; rating: SonarRating };
  reliability: { count: number; rating: SonarRating };
  maintainability: { count: number; rating: SonarRating };
  acceptedIssues: { count: number };
  coverage: { percentage: number; linesToCover: number };
  duplications: { percentage: number; duplicatedLines: number };
  securityHotspots: { count: number; rating: SonarRating };
}

export class SonarClient {
  private readonly serverUrl: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: SonarClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.token) {
      return {};
    }
    const encoded = Buffer.from(`${this.token}:`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  private parseRating(val?: string | number): SonarRating {
    const num = typeof val === "number" ? val : parseFloat(String(val || "1.0"));
    if (num <= 1.0) return "A";
    if (num <= 2.0) return "B";
    if (num <= 3.0) return "C";
    if (num <= 4.0) return "D";
    return "E";
  }

  /**
   * Validates credentials against SonarQube /api/authentication/validate
   */
  async verifyConnection(): Promise<VerificationResult> {
    try {
      const url = `${this.serverUrl}/api/authentication/validate`;
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...this.getAuthHeader(),
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message: `Authentication failed (HTTP ${response.status}). Please verify your token.`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          message: `Server returned HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { valid?: boolean };
      if (data && data.valid === true) {
        return { ok: true };
      }

      return {
        ok: false,
        message: "Invalid credentials: SonarQube reported token as invalid.",
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Cannot reach SonarQube server at ${this.serverUrl}: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Fetches projects from SonarQube /api/projects/search
   */
  async fetchProjects(): Promise<{ key: string; name: string }[]> {
    try {
      const url = `${this.serverUrl}/api/projects/search?ps=100`;
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { components?: { key: string; name: string }[] };
      return (data.components || []).map((p) => ({
        key: p.key,
        name: p.name || p.key,
      }));
    } catch (err: any) {
      console.error("Failed to fetch SonarQube projects:", err.message);
      return [];
    }
  }

  /**
   * Fetches Overall Code measures for the given project key
   */
  async getOverview(projectKey: string): Promise<SonarOverview> {
    const metricKeys = [
      "bugs",
      "reliability_rating",
      "vulnerabilities",
      "security_rating",
      "code_smells",
      "sqale_rating",
      "coverage",
      "lines_to_cover",
      "duplicated_lines_density",
      "duplicated_lines",
      "security_hotspots",
    ].join(",");

    const url = `${this.serverUrl}/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${metricKeys}`;
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch measures: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      component?: {
        measures?: { metric: string; value?: string }[];
      };
    };

    const measureMap: Record<string, string> = {};
    for (const m of data.component?.measures || []) {
      if (m.value !== undefined) {
        measureMap[m.metric] = m.value;
      }
    }

    return {
      security: {
        count: parseInt(measureMap.vulnerabilities || "0", 10),
        rating: this.parseRating(measureMap.security_rating),
      },
      reliability: {
        count: parseInt(measureMap.bugs || "0", 10),
        rating: this.parseRating(measureMap.reliability_rating),
      },
      maintainability: {
        count: parseInt(measureMap.code_smells || "0", 10),
        rating: this.parseRating(measureMap.sqale_rating),
      },
      acceptedIssues: {
        count: 0,
      },
      coverage: {
        percentage: parseFloat(measureMap.coverage || "0"),
        linesToCover: parseInt(measureMap.lines_to_cover || "0", 10),
      },
      duplications: {
        percentage: parseFloat(measureMap.duplicated_lines_density || "0"),
        duplicatedLines: parseInt(measureMap.duplicated_lines || "0", 10),
      },
      securityHotspots: {
        count: parseInt(measureMap.security_hotspots || "0", 10),
        rating: "A",
      },
    };
  }
}
