import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarClient } from '../src/modules/SonarClient.js';

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
});

describe('SonarClient - SonarQube Cloud organization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const orgFetchMock = (payload: unknown) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

  it('should append organization to every fetchProjects endpoint when configured', async () => {
    const fetchMock = orgFetchMock({
      components: [{ key: 'my-org_my-project', name: 'My Project' }],
    });

    const client = new SonarClient({
      serverUrl: 'https://sonarcloud.io',
      token: 'tok',
      organization: 'my-org',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await client.fetchProjects();

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toContain('organization=my-org');
    }
    expect(urls[0]).toBe(
      'https://sonarcloud.io/api/components/search?qualifiers=TRK&ps=100&organization=my-org',
    );
  });

  it('should not append organization to fetchProjects endpoints when not configured', async () => {
    const fetchMock = orgFetchMock({
      components: [{ key: 'proj-1', name: 'Project One' }],
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await client.fetchProjects();

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    for (const url of urls) {
      expect(url).not.toContain('organization=');
    }
  });

  it('should append organization to /api/rules/show when configured', async () => {
    const fetchMock = orgFetchMock({
      rule: { key: 'typescript:S1234', name: 'Some rule', mdDesc: 'Do the thing.' },
    });

    const client = new SonarClient({
      serverUrl: 'https://sonarcloud.io',
      token: 'tok',
      organization: 'my-org',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const doc = await client.getEnrichedRule('typescript:S1234');

    expect(doc.name).toBe('Some rule');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarcloud.io/api/rules/show?key=typescript%3AS1234&organization=my-org',
      expect.anything(),
    );
  });

  it('should trim whitespace and URL-encode the organization key', async () => {
    const fetchMock = orgFetchMock({
      rule: { key: 'r:1', name: 'R', mdDesc: 'd' },
    });

    const client = new SonarClient({
      serverUrl: 'https://sonarcloud.io',
      token: 'tok',
      organization: '  my org  ',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await client.getEnrichedRule('r:1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarcloud.io/api/rules/show?key=r%3A1&organization=my%20org',
      expect.anything(),
    );
  });

  it('should omit organization from /api/rules/show when not configured', async () => {
    const fetchMock = orgFetchMock({
      rule: { key: 'r:1', name: 'R', mdDesc: 'd' },
    });

    const client = new SonarClient({
      serverUrl: 'http://localhost:9000',
      token: 'tok',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await client.getEnrichedRule('r:1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9000/api/rules/show?key=r%3A1',
      expect.anything(),
    );
  });

  it('should not send organization on endpoints that work without it', async () => {
    const fetchMock = orgFetchMock({ valid: true });

    const client = new SonarClient({
      serverUrl: 'https://sonarcloud.io',
      token: 'tok',
      organization: 'my-org',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await client.verifyConnection();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarcloud.io/api/authentication/validate',
      expect.anything(),
    );
  });
});
