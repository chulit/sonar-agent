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

export interface SonarRuleDoc {
  key: string;
  name: string;
  cleanDesc: string;
  recommendation?: string;
}

export interface SonarDetailItem {
  id: string;
  ruleKey: string;
  message: string;
  component: string;
  filePath: string;
  line?: number;
  type: "BUG" | "VULNERABILITY" | "CODE_SMELL" | "HOTSPOT" | "COVERAGE" | "DUPLICATION";
  severity: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
  status: string;
  effort?: string;
  tags: string[];
  creationDate: string;
}

export class SonarClient {
  private readonly serverUrl: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: SonarClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.token = config.token ? config.token.trim() : undefined;
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

  private extractFilePath(component: string): string {
    const colonIndex = component.indexOf(":");
    if (colonIndex !== -1) {
      return component.slice(colonIndex + 1);
    }
    return component;
  }

  /**
   * Helper that executes fetch with Basic Auth and falls back to Bearer Auth if 401
   */
  private async authenticatedFetch(url: string): Promise<Response> {
    const basicHeaders = {
      Accept: "application/json",
      ...this.getAuthHeader(),
    };

    let response = await this.fetchFn(url, {
      method: "GET",
      headers: basicHeaders,
    });

    if (response.status === 401 && this.token) {
      // Try Bearer token fallback
      const bearerHeaders = {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      };
      const bearerResponse = await this.fetchFn(url, {
        method: "GET",
        headers: bearerHeaders,
      });
      if (bearerResponse.ok) {
        return bearerResponse;
      }
    }

    return response;
  }

  /**
   * Validates credentials against SonarQube /api/authentication/validate
   */
  async verifyConnection(): Promise<VerificationResult> {
    try {
      const url = `${this.serverUrl}/api/authentication/validate`;
      const response = await this.authenticatedFetch(url);

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
   * Fetches projects from SonarQube with multi-endpoint fallback
   * Supports /api/components/search?qualifiers=TRK, /api/components/search_projects, /api/projects/search
   */
  async fetchProjects(): Promise<{ key: string; name: string }[]> {
    const endpoints = [
      `${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100`,
      `${this.serverUrl}/api/components/search_projects?ps=100`,
      `${this.serverUrl}/api/projects/search?ps=100`,
      `${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK`,
      `${this.serverUrl}/api/components/search?qualifiers=TRK`,
    ];

    for (const url of endpoints) {
      try {
        const response = await this.authenticatedFetch(url);

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as any;
        const list: any[] =
          data.components ||
          data.projects ||
          data.results ||
          (Array.isArray(data) ? data : []);

        if (Array.isArray(list) && list.length > 0) {
          return list.map((p: any) => ({
            key: p.key || p.id || p.projectKey,
            name: p.name || p.key,
          }));
        }
      } catch (err: any) {
        // Try next fallback endpoint
      }
    }

    return [];
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
    const response = await this.authenticatedFetch(url);

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

  /**
   * Fetches issues list filtered by category/type
   */
  async getIssues(projectKey: string, category?: string): Promise<SonarDetailItem[]> {
    let typeParam = "BUG,VULNERABILITY,CODE_SMELL";
    if (category === "reliability") {
      typeParam = "BUG";
    } else if (category === "security") {
      typeParam = "VULNERABILITY";
    } else if (category === "maintainability") {
      typeParam = "CODE_SMELL";
    }

    const url = `${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&types=${typeParam}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { issues?: any[] };
    return (data.issues || []).map((item) => ({
      id: item.key,
      ruleKey: item.rule || "",
      message: item.message || "",
      component: item.component || "",
      filePath: this.extractFilePath(item.component || ""),
      line: item.line,
      type: item.type || "CODE_SMELL",
      severity: item.severity || "MAJOR",
      status: item.status || "OPEN",
      effort: item.effort,
      tags: item.tags || [],
      creationDate: item.creationDate || "",
    }));
  }

  /**
   * Fetches Security Hotspots for a project
   */
  async getHotspots(projectKey: string): Promise<SonarDetailItem[]> {
    const url = `${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(projectKey)}&status=TO_REVIEW&ps=100`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch hotspots: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { hotspots?: any[] };
    return (data.hotspots || []).map((item) => ({
      id: item.key,
      ruleKey: item.ruleKey || "",
      message: item.message || "",
      component: item.component || "",
      filePath: this.extractFilePath(item.component || ""),
      line: item.line,
      type: "HOTSPOT",
      severity: "MAJOR",
      status: item.status || "TO_REVIEW",
      tags: ["security-hotspot"],
      creationDate: item.creationDate || "",
    }));
  }

  /**
   * Fetches and cleans SonarQube rule details from /api/rules/show
   */
  async getEnrichedRule(ruleKey: string): Promise<SonarRuleDoc> {
    try {
      const url = `${this.serverUrl}/api/rules/show?key=${encodeURIComponent(ruleKey)}`;
      const response = await this.authenticatedFetch(url);

      if (!response.ok) {
        return {
          key: ruleKey,
          name: ruleKey,
          cleanDesc: "Verify code adherence to Sonar rule guidelines.",
        };
      }

      const data = (await response.json()) as {
        rule?: {
          key: string;
          name: string;
          htmlDesc?: string;
          mdDesc?: string;
        };
      };

      const desc = data.rule?.mdDesc || data.rule?.htmlDesc || "";
      const cleanDesc = desc
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        key: data.rule?.key || ruleKey,
        name: data.rule?.name || ruleKey,
        cleanDesc: cleanDesc || "Verify code adherence to Sonar rule guidelines.",
      };
    } catch {
      return {
        key: ruleKey,
        name: ruleKey,
        cleanDesc: "Verify code adherence to Sonar rule guidelines.",
      };
    }
  }

  /**
   * Fetches components with low coverage / uncovered lines
   */
  async getCoverageFiles(projectKey: string): Promise<SonarDetailItem[]> {
    const url = `${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(projectKey)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&ps=50`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch coverage files: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { components?: any[] };
    const items: SonarDetailItem[] = [];

    for (const comp of data.components || []) {
      const measureMap: Record<string, string> = {};
      for (const m of comp.measures || []) {
        measureMap[m.metric] = m.value;
      }

      const uncovered = parseInt(measureMap.uncovered_lines || "0", 10);
      const coverage = parseFloat(measureMap.coverage || "0");

      if (uncovered > 0 || coverage < 80) {
        items.push({
          id: comp.key,
          ruleKey: "coverage:uncovered_lines",
          message: `${uncovered} uncovered lines (${coverage.toFixed(0)}% coverage)`,
          component: comp.key,
          filePath: comp.path || this.extractFilePath(comp.key),
          type: "COVERAGE",
          severity: (coverage < 50 ? "CRITICAL" : "MAJOR") as any,
          status: "UNCOVERED",
          effort: `${uncovered} lines`,
          tags: ["test-coverage", "unit-test"],
          creationDate: new Date().toISOString(),
        });
      }
    }

    return items;
  }

  /**
   * Fetches components with duplicate code blocks
   */
  async getDuplicationFiles(projectKey: string): Promise<SonarDetailItem[]> {
    const url = `${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(projectKey)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&ps=50`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch duplication files: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { components?: any[] };
    const items: SonarDetailItem[] = [];

    for (const comp of data.components || []) {
      const measureMap: Record<string, string> = {};
      for (const m of comp.measures || []) {
        measureMap[m.metric] = m.value;
      }

      const density = parseFloat(measureMap.duplicated_lines_density || "0");
      const blocks = parseInt(measureMap.duplicated_blocks || "0", 10);

      if (density > 0 || blocks > 0) {
        items.push({
          id: comp.key,
          ruleKey: "duplications:duplicated_code",
          message: `${density.toFixed(1)}% duplicated lines (${blocks} duplicated blocks)`,
          component: comp.key,
          filePath: comp.path || this.extractFilePath(comp.key),
          type: "DUPLICATION",
          severity: (density > 20 ? "CRITICAL" : "MAJOR") as any,
          status: "DUPLICATED",
          effort: `${blocks} blocks`,
          tags: ["code-duplication", "refactoring"],
          creationDate: new Date().toISOString(),
        });
      }
    }

    return items;
  }
}
