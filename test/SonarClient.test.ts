import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarClient, InsufficientPermissionError } from '../src/modules/SonarClient.js';

describe('SonarClient - Connection Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully verify connection when SonarQube returns valid authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'test-token-123',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9000/api/authentication/validate',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('test-token-123:').toString('base64')}`,
        }),
      }),
    );
  });

  it('should fail verification when authentication is invalid (401)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ msg: 'Invalid credentials' }] }),
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'invalid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed (HTTP 401)');
  });

  it('should fail verification when server is unreachable or URL is invalid', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new SonarClient({
      serverUrl: 'http://unreachable-host:9000',
      token: 'some-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Cannot reach SonarQube server');
  });

  it('should fetch projects from /api/projects/search', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        components: [
          { key: 'proj-1', name: 'Project One' },
          { key: 'proj-2', name: 'Project Two' },
        ],
      }),
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const projects = await client.fetchProjects();

    expect(projects).toEqual([
      { key: 'proj-1', name: 'Project One' },
      { key: 'proj-2', name: 'Project Two' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9000/api/components/search?qualifiers=TRK&ps=100',
      expect.anything(),
    );
  });

  it('should fetch and correctly map Overall Code measures into SonarOverview', async () => {
    const mockMeasuresResponse = {
      component: {
        key: 'test-project',
        name: 'Test Project',
        measures: [
          { metric: 'vulnerabilities', value: '0' },
          { metric: 'security_rating', value: '1.0' },
          { metric: 'bugs', value: '2' },
          { metric: 'reliability_rating', value: '3.0' },
          { metric: 'code_smells', value: '27' },
          { metric: 'sqale_rating', value: '1.0' },
          { metric: 'accepted_issues', value: '5' },
          { metric: 'coverage', value: '77.3' },
          { metric: 'lines_to_cover', value: '22000' },
          { metric: 'duplicated_lines_density', value: '3.2' },
          { metric: 'duplicated_lines', value: '86000' },
          { metric: 'security_hotspots', value: '0' },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview('test-project');

    expect(overview.security).toEqual({ count: 0, rating: 'A' });
    expect(overview.reliability).toEqual({ count: 2, rating: 'C' });
    expect(overview.maintainability).toEqual({ count: 27, rating: 'A' });
    expect(overview.acceptedIssues).toEqual({ count: 5 });
    expect(overview.coverage).toEqual({ percentage: 77.3, linesToCover: 22000 });
    expect(overview.duplications).toEqual({ percentage: 3.2, duplicatedLines: 86000 });
    expect(overview.securityHotspots).toEqual({ count: 0, rating: 'A' });
  });

  it('should parse security_review_rating for security hotspots when provided', async () => {
    const mockMeasuresResponse = {
      component: {
        key: 'test-project',
        measures: [
          { metric: 'security_hotspots', value: '4' },
          { metric: 'security_review_rating', value: '3.0' },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview('test-project');
    expect(overview.securityHotspots).toEqual({ count: 4, rating: 'C' });
  });

  it('should fetch and map New Code measures when codePeriod is new', async () => {
    const mockMeasuresResponse = {
      component: {
        key: 'test-project',
        measures: [
          { metric: 'new_bugs', value: '1' },
          { metric: 'new_reliability_rating', value: '2.0' },
          { metric: 'new_vulnerabilities', value: '0' },
          { metric: 'new_security_rating', value: '1.0' },
          { metric: 'new_code_smells', value: '3' },
          { metric: 'new_maintainability_rating', value: '1.0' },
          { metric: 'new_coverage', value: '88.5' },
          { metric: 'new_lines_to_cover', value: '120' },
          { metric: 'new_duplicated_lines_density', value: '0.0' },
          { metric: 'new_duplicated_lines', value: '0' },
          { metric: 'new_security_hotspots', value: '0' },
          { metric: 'new_security_review_rating', value: '1.0' },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview('test-project', 'new');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('metricKeys=new_bugs'),
      expect.any(Object),
    );
    expect(overview.period).toBe('new');
    expect(overview.hasNewCode).toBe(true);
    expect(overview.reliability).toEqual({ count: 1, rating: 'B' });
    expect(overview.security).toEqual({ count: 0, rating: 'A' });
    expect(overview.maintainability).toEqual({ count: 3, rating: 'A' });
    expect(overview.coverage).toEqual({ percentage: 88.5, linesToCover: 120 });
    expect(overview.duplications).toEqual({ percentage: 0.0, duplicatedLines: 0 });
  });

  it('should flag hasNewCode as false when New Code measures indicate 0 new lines and 0 issues', async () => {
    const mockMeasuresResponse = {
      component: {
        key: 'test-project',
        measures: [
          { metric: 'new_bugs', value: '0' },
          { metric: 'new_vulnerabilities', value: '0' },
          { metric: 'new_code_smells', value: '0' },
          { metric: 'new_lines_to_cover', value: '0' },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview('test-project', 'new');
    expect(overview.period).toBe('new');
    expect(overview.hasNewCode).toBe(false);
  });

  it('should support period object response format from legacy SonarQube versions', async () => {
    const mockMeasuresResponse = {
      component: {
        key: 'test-project',
        measures: [
          { metric: 'new_bugs', period: { value: '2' } },
          { metric: 'new_coverage', period: { value: '95.0' } },
          { metric: 'new_lines_to_cover', period: { value: '50' } },
        ],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMeasuresResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const overview = await client.getOverview('test-project', 'new');
    expect(overview.reliability.count).toBe(2);
    expect(overview.coverage.percentage).toBe(95.0);
    expect(overview.coverage.linesToCover).toBe(50);
    expect(overview.hasNewCode).toBe(true);
  });

  it('should fetch issues and extract clean relative file paths', async () => {
    const mockIssuesResponse = {
      issues: [
        {
          key: 'ISSUE-1',
          rule: 'vue:S123',
          severity: 'MAJOR',
          type: 'BUG',
          component: 'my-project:resources/survey/components/widgets/TugasCardGrid.vue',
          line: 168,
          message:
            'Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.',
          effort: '5min',
          tags: ['accessibility', 'react'],
          creationDate: '2026-09-13T10:00:00+0000',
          author: 'alice@example.com',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockIssuesResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const items = await client.getIssues('my-project', 'reliability');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('ISSUE-1');
    expect(items[0].filePath).toBe('resources/survey/components/widgets/TugasCardGrid.vue');
    expect(items[0].line).toBe(168);
    expect(items[0].effort).toBe('5min');
    expect(items[0].tags).toEqual(['accessibility', 'react']);
    expect(items[0].author).toBe('alice@example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/issues/search?componentKeys=my-project&types=BUG'),
      expect.anything(),
    );
  });

  it('should fetch accepted issues using issueStatuses=ACCEPTED', async () => {
    const mockIssuesResponse = {
      issues: [
        {
          key: 'ISSUE-ACC-1',
          rule: 'typescript:S1186',
          severity: 'MINOR',
          type: 'CODE_SMELL',
          status: 'ACCEPTED',
          component: 'my-project:src/legacy.ts',
          line: 42,
          message: 'Empty function should not be used',
          effort: '2min',
          tags: ['bad-practice'],
          creationDate: '2026-09-10T10:00:00+0000',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockIssuesResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const items = await client.getIssues('my-project', 'accepted');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('ISSUE-ACC-1');
    expect(items[0].status).toBe('ACCEPTED');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/issueStatuses=ACCEPTED|resolutions=WONTFIX/),
      expect.anything(),
    );
  });

  it('should fetch coverage files from component_tree sorted by uncovered lines', async () => {
    const mockTreeResponse = {
      components: [
        {
          key: 'my-project:src/service.ts',
          name: 'service.ts',
          path: 'src/service.ts',
          measures: [
            { metric: 'uncovered_lines', value: '32' },
            { metric: 'coverage', value: '40.0' },
          ],
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTreeResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const files = await client.getCoverageFiles('my-project');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('s=metric&metricSort=uncovered_lines&asc=false'),
      expect.anything(),
    );
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src/service.ts');
    expect(files[0].type).toBe('COVERAGE');
    expect(files[0].message).toContain('32 uncovered lines (40% coverage)');
  });

  it('should fetch duplication files from component_tree sorted by duplicated lines density', async () => {
    const mockTreeResponse = {
      components: [
        {
          key: 'my-project:src/duplicate.ts',
          name: 'duplicate.ts',
          path: 'src/duplicate.ts',
          measures: [
            { metric: 'duplicated_lines_density', value: '15.4' },
            { metric: 'duplicated_blocks', value: '3' },
          ],
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTreeResponse,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const files = await client.getDuplicationFiles('my-project');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('s=metric&metricSort=duplicated_lines_density&asc=false'),
      expect.anything(),
    );
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src/duplicate.ts');
    expect(files[0].type).toBe('DUPLICATION');
    expect(files[0].message).toContain('15.4% duplicated lines (3 duplicated blocks)');
  });
});

describe('SonarClient - Quality Gate Status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function gateClient(payload: unknown, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => payload,
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    return { client, fetchMock };
  }

  it('should parse an OK quality gate payload', async () => {
    const { client, fetchMock } = gateClient({
      projectStatus: {
        status: 'OK',
        conditions: [
          {
            status: 'OK',
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '92.1',
          },
        ],
      },
    });

    const gate = await client.getQualityGateStatus('my-project');

    expect(gate).not.toBeNull();
    expect(gate?.status).toBe('OK');
    expect(gate?.conditions).toHaveLength(1);
    expect(gate?.conditions[0]).toMatchObject({
      status: 'OK',
      metricKey: 'coverage',
      comparator: 'LT',
      errorThreshold: '80',
      actualValue: '92.1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/qualitygates/project_status?projectKey=my-project'),
      expect.anything(),
    );
  });

  it('should parse WARN and ERROR payloads with their conditions', async () => {
    const { client } = gateClient({
      projectStatus: {
        status: 'ERROR',
        conditions: [
          {
            status: 'ERROR',
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '62.4',
          },
          {
            status: 'WARN',
            metricKey: 'duplicated_lines_density',
            comparator: 'GT',
            warnThreshold: '3',
            errorThreshold: '5',
            actualValue: '4.1',
          },
        ],
      },
    });

    const gate = await client.getQualityGateStatus('my-project');

    expect(gate?.status).toBe('ERROR');
    expect(gate?.conditions).toHaveLength(2);
    expect(gate?.conditions[1]).toMatchObject({
      status: 'WARN',
      metricKey: 'duplicated_lines_density',
      warnThreshold: '3',
    });
  });

  it('should return null when no quality gate is configured (NONE)', async () => {
    const { client } = gateClient({ projectStatus: { status: 'NONE', conditions: [] } });

    await expect(client.getQualityGateStatus('my-project')).resolves.toBeNull();
  });

  it('should return null, not throw, on HTTP 404 (older server)', async () => {
    const { client } = gateClient({ errors: [{ msg: 'Unknown url' }] }, 404);

    await expect(client.getQualityGateStatus('my-project')).resolves.toBeNull();
  });

  it('should return null, not throw, on HTTP 403 (no Browse permission)', async () => {
    const { client } = gateClient({ errors: [{ msg: 'Insufficient privileges' }] }, 403);

    await expect(client.getQualityGateStatus('my-project')).resolves.toBeNull();
  });

  it('should throw on unexpected HTTP errors so callers can log them', async () => {
    const { client } = gateClient({ errors: [{ msg: 'Server error' }] }, 500);

    await expect(client.getQualityGateStatus('my-project')).rejects.toThrow('HTTP 500');
  });

  it('should evaluate only new_* conditions when codePeriod is new and return OK when all new conditions pass', async () => {
    const { client } = gateClient({
      projectStatus: {
        status: 'ERROR',
        conditions: [
          {
            status: 'ERROR',
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '62.4',
          },
          {
            status: 'OK',
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '85.0',
          },
          {
            status: 'OK',
            metricKey: 'new_reliability_rating',
            comparator: 'GT',
            errorThreshold: '1',
            actualValue: '1',
          },
        ],
      },
    });

    const gate = await client.getQualityGateStatus('my-project', 'new');

    expect(gate).not.toBeNull();
    expect(gate?.period).toBe('new');
    expect(gate?.status).toBe('OK');
    expect(gate?.conditions).toHaveLength(2);
    expect(gate?.conditions.every((c) => c.metricKey.startsWith('new_'))).toBe(true);
  });

  it('should evaluate ERROR when a new_* condition fails in new code period', async () => {
    const { client } = gateClient({
      projectStatus: {
        status: 'ERROR',
        conditions: [
          {
            status: 'OK',
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '90.0',
          },
          {
            status: 'ERROR',
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '80',
            actualValue: '75.0',
          },
        ],
      },
    });

    const gate = await client.getQualityGateStatus('my-project', 'new');

    expect(gate?.period).toBe('new');
    expect(gate?.status).toBe('ERROR');
    expect(gate?.conditions).toHaveLength(1);
    expect(gate?.conditions[0].metricKey).toBe('new_coverage');
  });

  it('should evaluate WARN when a new_* condition warns in new code period', async () => {
    const { client } = gateClient({
      projectStatus: {
        status: 'WARN',
        conditions: [
          {
            status: 'WARN',
            metricKey: 'new_duplicated_lines_density',
            comparator: 'GT',
            warnThreshold: '3',
            actualValue: '4.5',
          },
        ],
      },
    });

    const gate = await client.getQualityGateStatus('my-project', 'new');

    expect(gate?.period).toBe('new');
    expect(gate?.status).toBe('WARN');
    expect(gate?.conditions[0].metricKey).toBe('new_duplicated_lines_density');
  });
});

describe('SonarClient - Issue Lifecycle Actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const okJson = (data: any) => ({ ok: true, status: 200, json: async () => data });

  function lifecycleClient(handler: (url: string, init?: any) => Promise<any>) {
    const fetchMock = vi.fn(async (url: any, init?: any) => handler(String(url), init));
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'secret-token-xyz',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    return { client, fetchMock };
  }

  it('getIssueTransitions returns the server response 1:1 without filtering', async () => {
    const { client, fetchMock } = lifecycleClient(async (url) => {
      expect(url).toBe('http://localhost:9000/api/issues/transitions?issue=ISSUE-1');
      return okJson({ transitions: ['confirm', 'falsepositive', 'wontfix'] });
    });

    const transitions = await client.getIssueTransitions('ISSUE-1');

    expect(transitions).toEqual(['confirm', 'falsepositive', 'wontfix']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('doIssueTransition POSTs urlencoded issue/transition with no token in URL or body', async () => {
    let captured: { url?: string; init?: any } = {};
    const { client } = lifecycleClient(async (url, init) => {
      captured = { url, init };
      return okJson({});
    });

    await client.doIssueTransition('ISSUE-1', 'falsepositive');

    expect(captured.url).toBe('http://localhost:9000/api/issues/do_transition');
    expect(captured.init.method).toBe('POST');
    expect(captured.init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(String(captured.init.body));
    expect(params.get('issue')).toBe('ISSUE-1');
    expect(params.get('transition')).toBe('falsepositive');
    // Token must not leak into the URL or the POST body…
    expect(captured.url).not.toContain('secret-token-xyz');
    expect(String(captured.init.body)).not.toContain('secret-token-xyz');
    // …it travels in the Authorization header only.
    expect(String(captured.init.headers.Authorization || '')).toMatch(/^(Basic|Bearer) /);
  });

  it('assignIssue sends the assignee; empty assignee unassigns', async () => {
    const bodies: string[] = [];
    const { client } = lifecycleClient(async (url, init) => {
      expect(url).toBe('http://localhost:9000/api/issues/assign');
      bodies.push(String(init.body));
      return okJson({});
    });

    await client.assignIssue('ISSUE-1', 'alice');
    await client.assignIssue('ISSUE-2');

    expect(new URLSearchParams(bodies[0]).get('assignee')).toBe('alice');
    expect(new URLSearchParams(bodies[1]).get('assignee')).toBe('');
    expect(bodies[1]).not.toContain('secret-token-xyz');
  });

  it('addIssueComment POSTs the comment text', async () => {
    let captured: { url?: string; init?: any } = {};
    const { client } = lifecycleClient(async (url, init) => {
      captured = { url, init };
      return okJson({});
    });

    await client.addIssueComment('ISSUE-1', 'Looks good to me');

    expect(captured.url).toBe('http://localhost:9000/api/issues/add_comment');
    expect(new URLSearchParams(String(captured.init.body)).get('text')).toBe('Looks good to me');
  });

  it('write operations surface InsufficientPermissionError on HTTP 403', async () => {
    const { client } = lifecycleClient(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({}),
    }));

    await expect(client.doIssueTransition('ISSUE-1', 'falsepositive')).rejects.toBeInstanceOf(
      InsufficientPermissionError,
    );
    await expect(client.assignIssue('ISSUE-1', 'alice')).rejects.toBeInstanceOf(
      InsufficientPermissionError,
    );
    await expect(client.addIssueComment('ISSUE-1', 'hi')).rejects.toBeInstanceOf(
      InsufficientPermissionError,
    );
  });

  it('getCurrentUserLogin returns the token owner login', async () => {
    const { client } = lifecycleClient(async (url) => {
      expect(url).toBe('http://localhost:9000/api/users/current');
      return okJson({ login: 'alice' });
    });

    await expect(client.getCurrentUserLogin()).resolves.toBe('alice');
  });
});
describe('SonarClient - SonarQube 10.x Clean Code Taxonomy mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function getFirstIssue(rawIssue: Record<string, unknown>) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ issues: [rawIssue] }),
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'valid-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const items = await client.getIssues('my-project', 'reliability');
    expect(items).toHaveLength(1);
    return items[0];
  }

  function baseIssue(overrides: Record<string, unknown> = {}) {
    return {
      key: 'ISSUE-10X-1',
      rule: 'typescript:S123',
      component: 'my-project:src/app.ts',
      line: 10,
      message: 'Some issue',
      ...overrides,
    };
  }

  it('maps RELIABILITY/HIGH impact to BUG/CRITICAL', async () => {
    const item = await getFirstIssue(
      baseIssue({ impacts: [{ softwareQuality: 'RELIABILITY', severity: 'HIGH' }] }),
    );
    expect(item.type).toBe('BUG');
    expect(item.severity).toBe('CRITICAL');
  });

  it('maps SECURITY/BLOCKER impact to VULNERABILITY/BLOCKER', async () => {
    const item = await getFirstIssue(
      baseIssue({ impacts: [{ softwareQuality: 'SECURITY', severity: 'BLOCKER' }] }),
    );
    expect(item.type).toBe('VULNERABILITY');
    expect(item.severity).toBe('BLOCKER');
  });

  it('maps MAINTAINABILITY/MEDIUM impact to CODE_SMELL/MAJOR', async () => {
    const item = await getFirstIssue(
      baseIssue({ impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'MEDIUM' }] }),
    );
    expect(item.type).toBe('CODE_SMELL');
    expect(item.severity).toBe('MAJOR');
  });

  it('maps MAINTAINABILITY/LOW impact to CODE_SMELL/MINOR', async () => {
    const item = await getFirstIssue(
      baseIssue({ impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'LOW' }] }),
    );
    expect(item.type).toBe('CODE_SMELL');
    expect(item.severity).toBe('MINOR');
  });

  it('maps SECURITY/INFO impact to VULNERABILITY/INFO', async () => {
    const item = await getFirstIssue(
      baseIssue({ impacts: [{ softwareQuality: 'SECURITY', severity: 'INFO' }] }),
    );
    expect(item.type).toBe('VULNERABILITY');
    expect(item.severity).toBe('INFO');
  });

  it('prefers issueStatus over legacy status', async () => {
    const item = await getFirstIssue(
      baseIssue({
        impacts: [{ softwareQuality: 'RELIABILITY', severity: 'HIGH' }],
        issueStatus: 'CONFIRMED',
        status: 'OPEN',
      }),
    );
    expect(item.status).toBe('CONFIRMED');
  });

  it('falls back to legacy flat fields when impacts are absent (older servers)', async () => {
    const item = await getFirstIssue(
      baseIssue({ type: 'BUG', severity: 'MINOR', status: 'CONFIRMED' }),
    );
    expect(item.type).toBe('BUG');
    expect(item.severity).toBe('MINOR');
    expect(item.status).toBe('CONFIRMED');
  });

  it('uses CODE_SMELL/MAJOR/OPEN defaults when no taxonomy data at all', async () => {
    const item = await getFirstIssue(baseIssue());
    expect(item.type).toBe('CODE_SMELL');
    expect(item.severity).toBe('MAJOR');
    expect(item.status).toBe('OPEN');
  });
});

describe('SonarClient - Edge Cases, Fallbacks & Error Branches', () => {
  it('strips trailing slashes from serverUrl and handles clients without token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000///',
      fetchFn: fetchMock as any,
    });
    expect((client as any).serverUrl).toBe('http://localhost:9000');
    const res = await client.verifyConnection();
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9000/api/authentication/validate',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it('correctly maps D and E ratings in parseRating', () => {
    const client = new SonarClient({ serverUrl: 'http://localhost:9000' });
    expect((client as any).parseRating(3.5)).toBe('D');
    expect((client as any).parseRating(4.5)).toBe('E');
    expect((client as any).extractFilePath('no_colon_path.ts')).toBe('no_colon_path.ts');
  });

  it('handles Bearer token retry when Basic auth receives 401', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 401, statusText: 'Unauthorized' };
      }
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'bearer_token_123',
      fetchFn: fetchMock as any,
    });
    const res = await client.verifyConnection();
    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it('handles abort and timeout in executeWithAuth', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock as any,
    });
    await expect(client.getOverview('proj')).rejects.toThrow(/timed out/);
  });

  it('handles verifyConnection when server returns invalid or non-ok status', async () => {
    const fetchMock500 = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
    });
    const client500 = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock500 as any,
    });
    const res500 = await client500.verifyConnection();
    expect(res500.ok).toBe(false);

    const fetchMockFalse = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: false }),
    });
    const clientFalse = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMockFalse as any,
    });
    const resFalse = await clientFalse.verifyConnection();
    expect(resFalse.ok).toBe(false);
    expect(resFalse.message).toContain('Invalid credentials');
  });

  it('falls back when metric keys are not found on older SonarQube (HTTP 400)', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          clone: () => ({
            json: async () => ({
              errors: [
                {
                  msg: 'The following metric keys are not found: software_quality_maintainability_issues, software_quality_reliability_issues',
                },
              ],
            }),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          component: {
            measures: [
              { metric: 'bugs', value: '3' },
              { metric: 'vulnerabilities', value: '1' },
              { metric: 'code_smells', value: '5' },
              { metric: 'coverage', value: '85.0' },
              { metric: 'sqale_debt_ratio', value: '1.2' },
            ],
          },
        }),
      };
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock as any,
    });
    const overview = await client.getOverview('my-proj');
    expect(overview).toBeDefined();
    expect(callCount).toBe(2);
  });

  it('getCurrentUserLogin handles non-ok response and missing login', async () => {
    const fetchErr = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error' });
    const clientErr = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchErr as any,
    });
    await expect(clientErr.getCurrentUserLogin()).rejects.toThrow(/Failed to fetch current user/);

    const fetchNoLogin = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const clientNoLogin = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchNoLogin as any,
    });
    await expect(clientNoLogin.getCurrentUserLogin()).rejects.toThrow(
      /Could not determine the current user/,
    );
  });

  it('getIssues falls back to resolutions=WONTFIX when accepted fails', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 400, statusText: 'Bad Request' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ issues: [{ key: 'I1', rule: 'r1', component: 'c1' }] }),
      };
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock as any,
    });
    const issues = await client.getIssues('my-proj', 'accepted');
    expect(issues).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  it('fetches hotspots successfully and throws on error', async () => {
    const fetchSuccess = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hotspots: [
          {
            key: 'H1',
            ruleKey: 'rspec:S1',
            message: 'Hotspot msg',
            component: 'proj:src/file.ts',
            line: 12,
          },
        ],
      }),
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchSuccess as any,
    });
    const items = await client.getHotspots('proj');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('HOTSPOT');

    const fetchErr = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
    const clientErr = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchErr as any,
    });
    await expect(clientErr.getHotspots('proj')).rejects.toThrow(/Failed to fetch hotspots/);
  });

  it('getEnrichedRule fetches and strips HTML descriptions, with graceful fallback', async () => {
    const fetchSuccess = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        rule: { key: 'ts:S101', name: 'Rule Name', htmlDesc: '<p>Do <b>not</b> do this.</p>' },
      }),
    });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      organization: 'org1',
      fetchFn: fetchSuccess as any,
    });
    const doc = await client.getEnrichedRule('ts:S101');
    expect(doc.name).toBe('Rule Name');
    expect(doc.cleanDesc).toBe('Do not do this.');

    const fetch404 = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const client404 = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetch404 as any,
    });
    const doc404 = await client404.getEnrichedRule('unknown:rule');
    expect(doc404.cleanDesc).toContain('Verify code adherence');

    const fetchThrow = vi.fn().mockRejectedValue(new Error('Network fail'));
    const clientThrow = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchThrow as any,
    });
    const docThrow = await clientThrow.getEnrichedRule('broken:rule');
    expect(docThrow.cleanDesc).toContain('Verify code adherence');
  });

  it('getCoverageFiles and getDuplicationFiles throw on HTTP failure', async () => {
    const fetchErr = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Fail' });
    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchErr as any,
    });
    await expect(client.getCoverageFiles('p')).rejects.toThrow(/Failed to fetch coverage files/);
    await expect(client.getDuplicationFiles('p')).rejects.toThrow(
      /Failed to fetch duplication files/,
    );
  });

  it('getIssues appends inNewCodePeriod=true and tags items when requested', async () => {
    let capturedUrl = '';
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          issues: [
            {
              key: 'NEW-ISSUE-1',
              rule: 'typescript:S2259',
              component: 'proj:src/UserService.ts',
              line: 42,
              message: 'Null pointer check missing',
            },
          ],
        }),
      };
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchFn as any,
    });

    const issues = await client.getIssues('proj', 'reliability', true);
    expect(capturedUrl).toContain('inNewCodePeriod=true');
    expect(issues).toHaveLength(1);
    expect(issues[0].inNewCodePeriod).toBe(true);
    expect(issues[0].id).toBe('NEW-ISSUE-1');
  });

  it('getHotspots appends inNewCodePeriod=true and tags hotspots when requested', async () => {
    let capturedUrl = '';
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hotspots: [
            {
              key: 'HOTSPOT-1',
              ruleKey: 'javascript:S4790',
              component: 'proj:src/hash.ts',
              line: 12,
              message: 'Weak hash algorithm',
            },
          ],
        }),
      };
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchFn as any,
    });

    const hotspots = await client.getHotspots('proj', true);
    expect(capturedUrl).toContain('inNewCodePeriod=true');
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].inNewCodePeriod).toBe(true);
    expect(hotspots[0].id).toBe('HOTSPOT-1');
  });
});
