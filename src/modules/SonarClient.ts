export interface SonarClientConfig {
  serverUrl: string;
  token?: string;
  /**
   * SonarQube Cloud organization key. Required by several SonarCloud-only
   * endpoints (project search, rule details). Leave empty for self-hosted
   * SonarQube, where the parameter does not exist.
   */
  organization?: string;
  fetchFn?: typeof fetch;
}

export interface VerificationResult {
  ok: boolean;
  message?: string;
}

export type SonarRating = 'A' | 'B' | 'C' | 'D' | 'E';
export type SonarCodePeriod = 'overall' | 'new';

export interface SonarOverview {
  security: { count: number; rating: SonarRating };
  reliability: { count: number; rating: SonarRating };
  maintainability: { count: number; rating: SonarRating };
  acceptedIssues: { count: number };
  coverage: { percentage: number; linesToCover: number };
  duplications: { percentage: number; duplicatedLines: number };
  securityHotspots: { count: number; rating: SonarRating };
  period?: SonarCodePeriod;
  hasNewCode?: boolean;
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
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'HOTSPOT' | 'COVERAGE' | 'DUPLICATION';
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  status: string;
  effort?: string;
  tags: string[];
  creationDate: string;
  author?: string;
  source?: string;
  inNewCodePeriod?: boolean;
}

export type QualityGateStatusValue = 'OK' | 'WARN' | 'ERROR' | 'NONE';

export interface QualityGateCondition {
  status: QualityGateStatusValue;
  metricKey: string;
  comparator: string;
  errorThreshold?: string;
  warnThreshold?: string;
  actualValue?: string;
}

export interface QualityGateStatus {
  status: 'OK' | 'WARN' | 'ERROR';
  conditions: QualityGateCondition[];
  period?: SonarCodePeriod;
}

function mapImpactToType(item: any): SonarDetailItem['type'] {
  const impact = item?.impacts?.[0];
  if (impact?.softwareQuality) {
    switch (impact.softwareQuality) {
      case 'RELIABILITY':
        return 'BUG';
      case 'SECURITY':
        return 'VULNERABILITY';
      case 'MAINTAINABILITY':
        return 'CODE_SMELL';
    }
  }
  if (item?.type === 'BUG' || item?.type === 'VULNERABILITY' || item?.type === 'CODE_SMELL') {
    return item.type;
  }
  return 'CODE_SMELL';
}

/**
 * Maps a SonarQube 10.x impact severity to the legacy severity scale.
 * Falls back to the legacy flat `severity` field when present (older servers).
 */
function mapImpactToSeverity(item: any): SonarDetailItem['severity'] {
  const impact = item?.impacts?.[0];
  if (impact?.severity) {
    switch (impact.severity) {
      case 'BLOCKER':
        return 'BLOCKER';
      case 'HIGH':
        return 'CRITICAL';
      case 'MEDIUM':
        return 'MAJOR';
      case 'LOW':
        return 'MINOR';
      case 'INFO':
        return 'INFO';
    }
  }
  const legacy = item?.severity;
  if (
    legacy === 'BLOCKER' ||
    legacy === 'CRITICAL' ||
    legacy === 'MAJOR' ||
    legacy === 'MINOR' ||
    legacy === 'INFO'
  ) {
    return legacy;
  }
  return 'MAJOR';
}

/**
 * Prefers the SonarQube 10.x `issueStatus` field, falling back to the
 * legacy flat `status` field (older servers).
 */
function mapIssueStatus(item: any): string {
  return item?.issueStatus || item?.status || 'OPEN';
}

/**
 * Thrown when the server rejects a write operation because the token lacks
 * the required permission (HTTP 403). The UI catches this to render a
 * friendly hint instead of a raw error.
 */
export class InsufficientPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientPermissionError';
  }
}

export class SonarClient {
  private readonly serverUrl: string;
  private readonly token?: string;
  private readonly organization?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: SonarClientConfig) {
    let url = config.serverUrl;
    while (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    this.serverUrl = url;
    this.token = config.token ? config.token.trim() : undefined;
    const org = config.organization ? config.organization.trim() : '';
    this.organization = org || undefined;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.token) {
      return {};
    }
    const encoded = Buffer.from(`${this.token}:`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  /**
   * SonarQube Cloud requires an `organization` query parameter on several
   * endpoints (project search, rule details). Returns '' when no organization
   * is configured so self-hosted SonarQube URLs stay untouched.
   */
  private orgParam(): string {
    return this.organization ? `&organization=${encodeURIComponent(this.organization)}` : '';
  }

  private parseRating(val?: string | number): SonarRating {
    const num = typeof val === 'number' ? val : Number.parseFloat(String(val || '1.0'));
    if (num <= 1.0) return 'A';
    if (num <= 2.0) return 'B';
    if (num <= 3.0) return 'C';
    if (num <= 4.0) return 'D';
    return 'E';
  }

  private extractFilePath(component: string): string {
    const colonIndex = component.indexOf(':');
    if (colonIndex !== -1) {
      return component.slice(colonIndex + 1);
    }
    return component;
  }

  /**
   * Core request executor: sends the request with Basic Auth and falls back
   * to Bearer Auth if the server answers 401. The token travels exclusively
   * in the Authorization header — never in the URL or the request body.
   */
  private async executeWithAuth(
    url: string,
    init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
    timeoutMs: number = 10000,
  ): Promise<Response> {
    const basicHeaders = {
      Accept: 'application/json',
      ...this.getAuthHeader(),
      ...init.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: init.method,
        headers: basicHeaders,
        body: init.body,
        signal: controller.signal,
      });

      if (response.status === 401 && this.token) {
        // Try Bearer token fallback
        const bearerHeaders = {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...init.headers,
        };
        const bearerResponse = await this.fetchFn(url, {
          method: init.method,
          headers: bearerHeaders,
          body: init.body,
          signal: controller.signal,
        });
        if (bearerResponse.ok) {
          return bearerResponse;
        }
      }

      return response;
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(`Connection timed out after ${timeoutMs / 1000}s`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper that executes fetch with Basic Auth and falls back to Bearer Auth if 401
   */
  private async authenticatedFetch(url: string, timeoutMs: number = 10000): Promise<Response> {
    return this.executeWithAuth(url, { method: 'GET' }, timeoutMs);
  }

  /**
   * POST sibling of authenticatedFetch. Parameters are sent as
   * application/x-www-form-urlencoded in the request body — never in the
   * URL query string (which leaks into server access logs and proxies).
   * Throws InsufficientPermissionError on HTTP 403.
   */
  private async authenticatedPost(
    path: string,
    params: Record<string, string>,
    timeoutMs: number = 10000,
  ): Promise<Response> {
    const url = `${this.serverUrl}${path}`;
    const body = new URLSearchParams(params).toString();
    const response = await this.executeWithAuth(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      timeoutMs,
    );

    if (response.status === 403) {
      throw new InsufficientPermissionError(
        'Your SonarQube token needs the "Administer Issues" permission for this action.',
      );
    }

    if (!response.ok) {
      throw new Error(`Request failed: HTTP ${response.status} ${response.statusText}`);
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
      if (data?.valid === true) {
        return { ok: true };
      }

      return {
        ok: false,
        message: 'Invalid credentials: SonarQube reported token as invalid.',
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
    const org = this.orgParam();
    const endpoints = [
      `${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100${org}`,
      `${this.serverUrl}/api/projects/search?ps=100${org}`,
      `${this.serverUrl}/api/components/search_projects?ps=100${org}`,
      `${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK${org}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await this.authenticatedFetch(url, 4000);

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as any;
        const list: any[] =
          data.components || data.projects || data.results || (Array.isArray(data) ? data : []);

        if (Array.isArray(list) && list.length > 0) {
          return list.map((p: any) => ({
            key: p.key || p.id || p.projectKey,
            name: p.name || p.key,
          }));
        }
      } catch {
        // endpoint unavailable or invalid response; continue loop
      }
    }

    return [];
  }

  /**
   * Fetches Overall or New Code measures for the given project key
   */
  async getOverview(
    projectKey: string,
    codePeriod: SonarCodePeriod = 'overall',
  ): Promise<SonarOverview> {
    const isNewCode = codePeriod === 'new';
    const metricKeys = isNewCode
      ? [
          'new_bugs',
          'new_reliability_rating',
          'new_vulnerabilities',
          'new_security_rating',
          'new_code_smells',
          'new_maintainability_rating',
          'new_accepted_issues',
          'new_coverage',
          'new_lines_to_cover',
          'new_duplicated_lines_density',
          'new_duplicated_lines',
          'new_security_hotspots',
          'new_security_review_rating',
        ].join(',')
      : [
          'bugs',
          'reliability_rating',
          'vulnerabilities',
          'security_rating',
          'code_smells',
          'sqale_rating',
          'accepted_issues',
          'wont_fix_issues',
          'coverage',
          'lines_to_cover',
          'duplicated_lines_density',
          'duplicated_lines',
          'security_hotspots',
          'security_review_rating',
        ].join(',');

    const url = `${this.serverUrl}/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${metricKeys}`;
    let response = await this.authenticatedFetch(url);

    if (!response.ok && (response.status === 400 || response.status === 404)) {
      try {
        const errorData = (await response.clone().json()) as any;
        const msg = errorData?.errors?.[0]?.msg || '';
        const match = msg.match(/The following metric keys are not found:\s*([^.]+)/i);
        if (match?.[1]) {
          const notFoundKeys = new Set(match[1].split(',').map((k: string) => k.trim()));
          const validKeys = metricKeys
            .split(',')
            .filter((k) => !notFoundKeys.has(k))
            .join(',');
          const fallbackUrl = `${this.serverUrl}/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${validKeys}`;
          const fallbackResponse = await this.authenticatedFetch(fallbackUrl);
          if (fallbackResponse.ok) {
            response = fallbackResponse;
          }
        }
      } catch {
        // Fall through to standard error throw
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch measures: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      component?: {
        measures?: {
          metric: string;
          value?: string;
          period?: { value?: string };
          periods?: { value?: string; index?: number }[];
        }[];
      };
    };

    const measureMap: Record<string, string> = {};
    for (const m of data.component?.measures || []) {
      const val = m.value !== undefined ? m.value : (m.period?.value ?? m.periods?.[0]?.value);
      if (val !== undefined) {
        measureMap[m.metric] = val;
      }
    }

    const rawBugs = isNewCode ? measureMap.new_bugs : measureMap.bugs;
    const rawReliabilityRating = isNewCode
      ? measureMap.new_reliability_rating
      : measureMap.reliability_rating;
    const rawVulnerabilities = isNewCode
      ? measureMap.new_vulnerabilities
      : measureMap.vulnerabilities;
    const rawSecurityRating = isNewCode
      ? measureMap.new_security_rating
      : measureMap.security_rating;
    const rawCodeSmells = isNewCode ? measureMap.new_code_smells : measureMap.code_smells;
    const rawMaintainabilityRating = isNewCode
      ? measureMap.new_maintainability_rating || measureMap.new_sqale_rating
      : measureMap.sqale_rating;
    const rawAcceptedIssues = isNewCode
      ? measureMap.new_accepted_issues || measureMap.new_wont_fix_issues
      : measureMap.accepted_issues || measureMap.wont_fix_issues;
    const rawCoverage = isNewCode ? measureMap.new_coverage : measureMap.coverage;
    const rawLinesToCover = isNewCode ? measureMap.new_lines_to_cover : measureMap.lines_to_cover;
    const rawDuplicatedDensity = isNewCode
      ? measureMap.new_duplicated_lines_density
      : measureMap.duplicated_lines_density;
    const rawDuplicatedLines = isNewCode
      ? measureMap.new_duplicated_lines
      : measureMap.duplicated_lines;
    const rawHotspots = isNewCode ? measureMap.new_security_hotspots : measureMap.security_hotspots;
    const rawHotspotRating = isNewCode
      ? measureMap.new_security_review_rating
      : measureMap.security_review_rating;

    const parsedLinesToCover = Number.parseInt(rawLinesToCover || '0', 10);
    const parsedBugs = Number.parseInt(rawBugs || '0', 10);
    const parsedVulns = Number.parseInt(rawVulnerabilities || '0', 10);
    const parsedSmells = Number.parseInt(rawCodeSmells || '0', 10);
    const parsedHotspots = Number.parseInt(rawHotspots || '0', 10);
    const parsedDuplications = Number.parseInt(rawDuplicatedLines || '0', 10);

    const hasNewCode = isNewCode
      ? parsedLinesToCover > 0 ||
        parsedBugs > 0 ||
        parsedVulns > 0 ||
        parsedSmells > 0 ||
        parsedHotspots > 0 ||
        parsedDuplications > 0
      : true;

    return {
      security: {
        count: parsedVulns,
        rating: this.parseRating(rawSecurityRating),
      },
      reliability: {
        count: parsedBugs,
        rating: this.parseRating(rawReliabilityRating),
      },
      maintainability: {
        count: parsedSmells,
        rating: this.parseRating(rawMaintainabilityRating),
      },
      acceptedIssues: {
        count: Number.parseInt(rawAcceptedIssues || '0', 10),
      },
      coverage: {
        percentage: Number.parseFloat(rawCoverage || '0'),
        linesToCover: parsedLinesToCover,
      },
      duplications: {
        percentage: Number.parseFloat(rawDuplicatedDensity || '0'),
        duplicatedLines: parsedDuplications,
      },
      securityHotspots: {
        count: parsedHotspots,
        rating: this.parseRating(rawHotspotRating || '1.0'),
      },
      period: codePeriod,
      hasNewCode,
    };
  }

  /**
   * Fetches the Quality Gate status for the given project key.
   * Returns null when no quality gate is configured (NONE), the endpoint is
   * unavailable on older servers (404), or the token lacks Browse permission
   * (403) — the widget hides silently in all these cases and must never
   * break the existing overview. When codePeriod is 'new', evaluates only
   * conditions with metricKey starting with 'new_'.
   */
  async getQualityGateStatus(
    projectKey: string,
    codePeriod: SonarCodePeriod = 'overall',
  ): Promise<QualityGateStatus | null> {
    const url = `${this.serverUrl}/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`;
    const response = await this.authenticatedFetch(url);

    if (response.status === 404 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch quality gate status: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      projectStatus?: {
        status?: QualityGateStatusValue;
        conditions?: {
          status?: QualityGateStatusValue;
          metricKey?: string;
          comparator?: string;
          errorThreshold?: string;
          warnThreshold?: string;
          actualValue?: string;
        }[];
      };
    };

    const projectStatus = data?.projectStatus;
    const status = projectStatus?.status;
    if (!status || status === 'NONE') {
      return null;
    }

    const allConditions: QualityGateCondition[] = (projectStatus.conditions || []).map((c) => ({
      status: c.status || 'OK',
      metricKey: c.metricKey || '',
      comparator: c.comparator || '',
      errorThreshold: c.errorThreshold,
      warnThreshold: c.warnThreshold,
      actualValue: c.actualValue,
    }));

    if (codePeriod === 'new') {
      const newConditions = allConditions.filter((c) => c.metricKey.startsWith('new_'));
      let derivedStatus: 'OK' | 'WARN' | 'ERROR' = 'OK';
      if (newConditions.some((c) => c.status === 'ERROR')) {
        derivedStatus = 'ERROR';
      } else if (newConditions.some((c) => c.status === 'WARN')) {
        derivedStatus = 'WARN';
      }
      return {
        status: derivedStatus,
        conditions: newConditions,
        period: 'new',
      };
    }

    return {
      status,
      conditions: allConditions,
      period: 'overall',
    };
  }

  /**
   * Lists the transitions available for an issue, exactly as reported by the
   * server. Returned 1:1 without filtering — available transitions depend on
   * issue type, status, and server version.
   */
  async getIssueTransitions(issueKey: string): Promise<string[]> {
    const url = `${this.serverUrl}/api/issues/transitions?issue=${encodeURIComponent(issueKey)}`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch issue transitions: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { transitions?: string[] };
    return [...(data.transitions || [])];
  }

  /**
   * Applies a server-provided transition to an issue
   * (e.g. falsepositive, wontfix, confirm, reopen).
   */
  async doIssueTransition(issueKey: string, transition: string): Promise<void> {
    await this.authenticatedPost('/api/issues/do_transition', {
      issue: issueKey,
      transition,
    });
  }

  /**
   * Assigns an issue to a user. An empty assignee unassigns it.
   */
  async assignIssue(issueKey: string, assignee?: string): Promise<void> {
    await this.authenticatedPost('/api/issues/assign', {
      issue: issueKey,
      assignee: assignee || '',
    });
  }

  /**
   * Adds a comment to an issue.
   */
  async addIssueComment(issueKey: string, text: string): Promise<void> {
    await this.authenticatedPost('/api/issues/add_comment', {
      issue: issueKey,
      text,
    });
  }

  /**
   * Returns the login of the user owning the configured token.
   */
  async getCurrentUserLogin(): Promise<string> {
    const url = `${this.serverUrl}/api/users/current`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch current user: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { login?: string };
    if (!data.login) {
      throw new Error('Could not determine the current user from the SonarQube server.');
    }
    return data.login;
  }

  /**
   * Fetches issues list filtered by category/type and optionally scoped to New Code period
   */
  async getIssues(
    projectKey: string,
    category?: string,
    inNewCodePeriod: boolean = false,
  ): Promise<SonarDetailItem[]> {
    const periodParam = inNewCodePeriod ? '&inNewCodePeriod=true' : '';
    let url: string;
    if (category === 'accepted') {
      url = `${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&types=BUG,VULNERABILITY,CODE_SMELL&issueStatuses=ACCEPTED&ps=100${periodParam}`;
    } else {
      let typeParam = 'BUG,VULNERABILITY,CODE_SMELL';
      if (category === 'reliability') {
        typeParam = 'BUG';
      } else if (category === 'security') {
        typeParam = 'VULNERABILITY';
      } else if (category === 'maintainability') {
        typeParam = 'CODE_SMELL';
      }
      url = `${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&types=${typeParam}&statuses=OPEN,CONFIRMED,REOPENED&ps=100${periodParam}`;
    }

    let response = await this.authenticatedFetch(url);

    // Fallback for older SonarQube versions using resolutions=WONTFIX
    if (!response.ok && category === 'accepted') {
      const fallbackUrl = `${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&types=BUG,VULNERABILITY,CODE_SMELL&resolutions=WONTFIX&ps=100${periodParam}`;
      const fallbackResponse = await this.authenticatedFetch(fallbackUrl);
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { issues?: any[] };
    return (data.issues || []).map((item) => ({
      id: item.key,
      ruleKey: item.rule || '',
      message: item.message || '',
      component: item.component || '',
      filePath: this.extractFilePath(item.component || ''),
      line: item.line,
      type: mapImpactToType(item),
      severity: mapImpactToSeverity(item),
      status: mapIssueStatus(item),
      effort: item.effort,
      tags: item.tags || [],
      creationDate: item.creationDate || '',
      author: item.author || undefined,
      inNewCodePeriod: inNewCodePeriod || item.inNewCodePeriod === true,
    }));
  }

  /**
   * Fetches Security Hotspots for a project, optionally scoped to New Code period
   */
  async getHotspots(
    projectKey: string,
    inNewCodePeriod: boolean = false,
  ): Promise<SonarDetailItem[]> {
    const periodParam = inNewCodePeriod ? '&inNewCodePeriod=true' : '';
    const url = `${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(projectKey)}&status=TO_REVIEW&ps=100${periodParam}`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch hotspots: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { hotspots?: any[] };
    return (data.hotspots || []).map((item) => ({
      id: item.key,
      ruleKey: item.ruleKey || '',
      message: item.message || '',
      component: item.component || '',
      filePath: this.extractFilePath(item.component || ''),
      line: item.line,
      type: 'HOTSPOT',
      severity: 'MAJOR',
      status: item.status || 'TO_REVIEW',
      tags: ['security-hotspot'],
      creationDate: item.creationDate || '',
      author: item.author || undefined,
      inNewCodePeriod: inNewCodePeriod || item.inNewCodePeriod === true,
    }));
  }

  /**
   * Fetches and cleans SonarQube rule details from /api/rules/show
   */
  async getEnrichedRule(ruleKey: string): Promise<SonarRuleDoc> {
    try {
      const url = `${this.serverUrl}/api/rules/show?key=${encodeURIComponent(ruleKey)}${this.orgParam()}`;
      const response = await this.authenticatedFetch(url);

      if (!response.ok) {
        return {
          key: ruleKey,
          name: ruleKey,
          cleanDesc: 'Verify code adherence to Sonar rule guidelines.',
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

      const desc = data.rule?.mdDesc || data.rule?.htmlDesc || '';
      const cleanDesc = stripHtmlTags(desc).replace(/\s+/g, ' ').trim();

      return {
        key: data.rule?.key || ruleKey,
        name: data.rule?.name || ruleKey,
        cleanDesc: cleanDesc || 'Verify code adherence to Sonar rule guidelines.',
      };
    } catch {
      return {
        key: ruleKey,
        name: ruleKey,
        cleanDesc: 'Verify code adherence to Sonar rule guidelines.',
      };
    }
  }

  /**
   * Fetches components with low coverage / uncovered lines
   */
  async getCoverageFiles(projectKey: string): Promise<SonarDetailItem[]> {
    const url = `${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(projectKey)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&strategy=leaves&s=metric&metricSort=uncovered_lines&asc=false&ps=100`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch coverage files: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { components?: any[] };
    const items: SonarDetailItem[] = [];

    for (const comp of data.components || []) {
      const measureMap: Record<string, string> = {};
      for (const m of comp.measures || []) {
        measureMap[m.metric] = m.value;
      }

      const uncovered = Number.parseInt(measureMap.uncovered_lines || '0', 10);
      const coverage = Number.parseFloat(measureMap.coverage || '0');

      if (uncovered > 0 || coverage < 80) {
        items.push({
          id: comp.key,
          ruleKey: 'coverage:uncovered_lines',
          message: `${uncovered} uncovered lines (${coverage.toFixed(0)}% coverage)`,
          component: comp.key,
          filePath: comp.path || this.extractFilePath(comp.key),
          type: 'COVERAGE',
          severity: (coverage < 50 ? 'CRITICAL' : 'MAJOR') as any,
          status: 'UNCOVERED',
          effort: `${uncovered} lines`,
          tags: ['test-coverage', 'unit-test'],
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
    const url = `${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(projectKey)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&strategy=leaves&s=metric&metricSort=duplicated_lines_density&asc=false&ps=100`;
    const response = await this.authenticatedFetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch duplication files: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { components?: any[] };
    const items: SonarDetailItem[] = [];

    for (const comp of data.components || []) {
      const measureMap: Record<string, string> = {};
      for (const m of comp.measures || []) {
        measureMap[m.metric] = m.value;
      }

      const density = Number.parseFloat(measureMap.duplicated_lines_density || '0');
      const blocks = Number.parseInt(measureMap.duplicated_blocks || '0', 10);

      if (density > 0 || blocks > 0) {
        items.push({
          id: comp.key,
          ruleKey: 'duplications:duplicated_code',
          message: `${density.toFixed(1)}% duplicated lines (${blocks} duplicated blocks)`,
          component: comp.key,
          filePath: comp.path || this.extractFilePath(comp.key),
          type: 'DUPLICATION',
          severity: (density > 20 ? 'CRITICAL' : 'MAJOR') as any,
          status: 'DUPLICATED',
          effort: `${blocks} blocks`,
          tags: ['code-duplication', 'refactoring'],
          creationDate: new Date().toISOString(),
        });
      }
    }

    return items;
  }
}

function stripHtmlTags(str: string): string {
  let result = '';
  let insideTag = false;
  for (const char of str) {
    if (char === '<') {
      insideTag = true;
      result += ' ';
    } else if (char === '>') {
      insideTag = false;
    } else if (!insideTag) {
      result += char;
    }
  }
  return result;
}
