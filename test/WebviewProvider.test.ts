import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';
import { SonarClient } from '../src/modules/SonarClient.js';

describe('SonarOverviewViewProvider - Webview Lifecycle & CSP', () => {
  let mockProjectDetector: any;
  let mockConfig: any;
  let mockToken: string | undefined;
  let provider: SonarOverviewViewProvider;
  let mockWebviewView: any;
  let messageCallback: ((msg: any) => Promise<void>) | undefined;
  let visibilityCallback: (() => void) | undefined;
  let postedMessages: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    postedMessages = [];

    mockConfig = {
      serverUrl: 'http://localhost:9000',
      projectKey: 'org.sample:project',
      hasToken: true,
    };
    mockToken = 'sqp_valid_token_123';

    mockProjectDetector = {
      getConfig: vi.fn(async () => ({ ...mockConfig })),
      getToken: vi.fn(async () => mockToken),
      setServerUrl: vi.fn(async (url: string) => {
        mockConfig.serverUrl = url;
      }),
      setToken: vi.fn(async (token: string) => {
        mockToken = token;
        mockConfig.hasToken = true;
      }),
      deleteToken: vi.fn(async () => {
        mockToken = undefined;
        mockConfig.hasToken = false;
      }),
      setProjectKey: vi.fn(async (key: string) => {
        mockConfig.projectKey = key;
      }),
      listProfiles: vi.fn(async () => []),
      getActiveProfile: vi.fn(async () => null),
    };

    mockWebviewView = {
      visible: true,
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview-test-resource:',
        postMessage: vi.fn(async (msg: any) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageCallback = cb;
          return { dispose: vi.fn() };
        }),
      },
      onDidChangeVisibility: vi.fn((cb: any) => {
        visibilityCallback = cb;
        return { dispose: vi.fn() };
      }),
    };

    provider = new SonarOverviewViewProvider(
      { fsPath: '/extension' } as any,
      mockProjectDetector as unknown as ProjectDetector,
    );
  });

  it('should include Content-Security-Policy meta tag and matching nonce on script tag in webview html', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const html = mockWebviewView.webview.html;
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');

    // CSP must allow scripts with nonce
    const cspMatch = html.match(/content="([^"]*)"/i);
    expect(cspMatch).not.toBeNull();
    const cspContent = cspMatch![1];
    expect(cspContent).toContain("script-src 'nonce-");

    // Extract the nonce from CSP
    const nonceMatch = cspContent.match(/script-src 'nonce-([a-zA-Z0-9]+)'/);
    expect(nonceMatch).not.toBeNull();
    const nonce = nonceMatch![1];

    // The <script> tag in HTML must have the exact same nonce
    expect(html).toContain(`<script nonce="${nonce}">`);
  });

  it('should include master Select All controls for both the Overall Code and Current Code issue lists', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const html = mockWebviewView.webview.html;
    expect(html).toContain('id="select-all-checkbox"');
    expect(html).toContain('id="current-select-all-checkbox"');
  });

  it('should proactively sync state on resolveWebviewView and when visibility changes', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Wait for microtasks
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(postedMessages.some((m) => m.type === 'state' || m.type === 'loading')).toBe(true);

    postedMessages = [];
    if (visibilityCallback) {
      mockWebviewView.visible = true;
      visibilityCallback();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(postedMessages.some((m) => m.type === 'state' || m.type === 'loading')).toBe(true);
    }
  });

  it('should catch unexpected errors in _syncState and post error message to webview', async () => {
    mockProjectDetector.getConfig = vi.fn().mockRejectedValue(new Error('Keychain locked'));

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Trigger init
    if (messageCallback) {
      await messageCallback({ command: 'init' });
    }

    expect(
      postedMessages.some((m) => m.type === 'error' && m.message.includes('Keychain locked')),
    ).toBe(true);
  });

  it('should handle connect command when verification fails and post error to webview', async () => {
    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: false,
      message: 'Invalid credentials: SonarQube reported token as invalid.',
    });

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({
        command: 'connect',
        serverUrl: 'http://10.15.34.9:9000',
        token: 'invalid_token',
      });
    }

    expect(postedMessages.some((m) => m.type === 'connecting')).toBe(true);
    expect(
      postedMessages.some(
        (m) =>
          m.type === 'error' &&
          m.message.includes('Invalid credentials: SonarQube reported token as invalid.'),
      ),
    ).toBe(true);
    expect(mockProjectDetector.setServerUrl).not.toHaveBeenCalled();
    expect(mockProjectDetector.setToken).not.toHaveBeenCalled();
  });

  it('should handle connect command when verification succeeds and sync state', async () => {
    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: true,
    });
    vi.spyOn(SonarClient.prototype, 'fetchProjects').mockResolvedValue([
      { key: 'my-project', name: 'My Project' },
    ]);
    vi.spyOn(SonarClient.prototype, 'getQualityGateStatus').mockResolvedValue(null);
    vi.spyOn(SonarClient.prototype, 'getOverview').mockResolvedValue({
      security: { count: 0, rating: 'A' },
      reliability: { count: 0, rating: 'A' },
      maintainability: { count: 0, rating: 'A' },
      acceptedIssues: { count: 0 },
      coverage: { percentage: 80, linesToCover: 100 },
      duplications: { percentage: 1, duplicatedLines: 10 },
      securityHotspots: { count: 0, rating: 'A' },
    });

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({
        command: 'connect',
        serverUrl: 'http://10.15.34.9:9000',
        token: 'valid_token',
      });
    }

    expect(postedMessages.some((m) => m.type === 'connecting')).toBe(true);
    expect(mockProjectDetector.setServerUrl).toHaveBeenCalledWith('http://10.15.34.9:9000');
    expect(mockProjectDetector.setToken).toHaveBeenCalledWith('valid_token');
    expect(postedMessages.some((m) => m.type === 'state' && m.state === 'connected')).toBe(true);
  });

  it('should handle disconnect command when not connected by clearing inputs and posting disconnected message', async () => {
    mockConfig.hasToken = false;
    mockToken = undefined;

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'disconnect' });
    }

    expect(
      postedMessages.some(
        (m) => m.type === 'disconnected' && m.message === 'Connection credentials cleared.',
      ),
    ).toBe(true);
    expect(mockProjectDetector.deleteToken).not.toHaveBeenCalled();
  });

  it('should prompt confirmation when connected on disconnect command and delete token if confirmed', async () => {
    const showWarningSpy = vi
      .spyOn((await import('vscode')).window, 'showWarningMessage')
      .mockResolvedValue('Disconnect' as any);

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'disconnect' });
    }

    expect(showWarningSpy).toHaveBeenCalledWith(
      'Are you sure you want to disconnect and remove stored SonarQube credentials?',
      { modal: true },
      'Disconnect',
    );
    expect(mockProjectDetector.deleteToken).toHaveBeenCalled();
    expect(
      postedMessages.some(
        (m) =>
          m.type === 'disconnected' &&
          m.message === 'Disconnected from SonarQube. Credentials removed.',
      ),
    ).toBe(true);
  });

  it('should not delete token on disconnect command if confirmation is cancelled', async () => {
    vi.spyOn((await import('vscode')).window, 'showWarningMessage').mockResolvedValue(
      undefined as any,
    );

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'disconnect' });
    }

    expect(mockProjectDetector.deleteToken).not.toHaveBeenCalled();
    expect(postedMessages.some((m) => m.type === 'disconnected')).toBe(false);
  });
});

describe('SonarOverviewViewProvider - Profile Switcher UI', () => {
  let mockSecrets: Record<string, string>;
  let mockStore: Record<string, any>;
  let detector: ProjectDetector;
  let provider: SonarOverviewViewProvider;
  let mockWebviewView: any;
  let messageCallback: ((msg: any) => Promise<void>) | undefined;
  let postedMessages: any[] = [];

  const overviewStub = {
    security: { count: 0, rating: 'A' },
    reliability: { count: 0, rating: 'A' },
    maintainability: { count: 0, rating: 'A' },
    acceptedIssues: { count: 0 },
    coverage: { percentage: 80, linesToCover: 100 },
    duplications: { percentage: 1, duplicatedLines: 10 },
    securityHotspots: { count: 0, rating: 'A' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    postedMessages = [];
    mockSecrets = {};
    mockStore = {};
    detector = new ProjectDetector({
      secretStorage: {
        get: async (key: string) => mockSecrets[key],
        store: async (key: string, value: string) => {
          mockSecrets[key] = value;
        },
        delete: async (key: string) => {
          delete mockSecrets[key];
        },
      },
      workspaceConfig: {
        get: (key: string, defaultValue?: any) => mockStore[key] ?? defaultValue,
        update: async (key: string, value: any) => {
          mockStore[key] = value;
        },
      },
    });
    provider = new SonarOverviewViewProvider({ fsPath: '/extension' } as any, detector);
    mockWebviewView = {
      visible: true,
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn(async (msg: any) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageCallback = cb;
          return { dispose: vi.fn() };
        }),
      },
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    vi.spyOn(SonarClient.prototype, 'fetchProjects').mockResolvedValue([]);
    vi.spyOn(SonarClient.prototype, 'getOverview').mockResolvedValue(overviewStub as any);
  });

  it('should render profile switcher select and no-profiles empty state in webview html', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(mockWebviewView.webview.html).toContain('id="profile-switcher"');
    expect(mockWebviewView.webview.html).toContain('id="no-profiles-view"');
  });

  it('should post no-profiles state when no profiles and no legacy config exist', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];
    if (messageCallback) {
      await messageCallback({ command: 'init' });
    }
    expect(postedMessages.some((m) => m.type === 'state' && m.state === 'no-profiles')).toBe(true);
  });

  it('should switch the active binding via switchProfile message', async () => {
    vi.spyOn(SonarClient.prototype, 'getQualityGateStatus').mockResolvedValue(null);
    await detector.createProfile({
      name: 'Alpha',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 'tok-alpha',
    });
    await detector.createProfile({
      name: 'Beta',
      serverUrl: 'http://b:9000',
      projectKey: 'b:key',
      token: 'tok-beta',
    });
    await detector.activateProfile('alpha');
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'switchProfile', profileId: 'beta' });
    }

    expect((await detector.getConfig()).projectKey).toBe('b:key');
    expect(await detector.getToken()).toBe('tok-beta');
    expect(
      postedMessages.some(
        (m) => m.type === 'state' && m.state === 'connected' && m.projectKey === 'b:key',
      ),
    ).toBe(true);
  });

  it('should keep the previous active profile when switching to an unknown id', async () => {
    await detector.createProfile({
      name: 'Alpha',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 'tok-alpha',
    });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'switchProfile', profileId: 'nope' });
    }

    expect((await detector.getConfig()).projectKey).toBe('a:key');
    expect(postedMessages.some((m) => m.type === 'error')).toBe(true);
  });

  it('should preserve the active profile when credential verification fails', async () => {
    await detector.createProfile({
      name: 'Alpha',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 'tok-alpha',
    });
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('http://evil:9000')
      .mockResolvedValueOnce('bad-token');
    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: false,
      message: 'HTTP 401 Unauthorized',
    });
    vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Cancel' as any);

    await provider.promptUpdateCredentials();

    expect((await detector.getConfig()).serverUrl).toBe('http://a:9000');
    expect(await detector.getToken()).toBe('tok-alpha');
  });

  it('should land in no-profiles empty state after deleting the active profile', async () => {
    const created = await detector.createProfile({
      name: 'Solo',
      serverUrl: 'http://solo:9000',
      projectKey: 'solo:key',
      token: 'tok-solo',
    });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await detector.deleteProfile(created.id);
    expect(mockSecrets['sonarAgent.token.solo']).toBeUndefined();
    postedMessages = [];

    if (messageCallback) {
      await messageCallback({ command: 'refresh' });
    }

    expect(postedMessages.some((m) => m.type === 'state' && m.state === 'no-profiles')).toBe(true);
  });

  it('should delete the active profile through the manage menu and land in no-profiles', async () => {
    await detector.createProfile({
      name: 'Solo',
      serverUrl: 'http://solo:9000',
      projectKey: 'solo:key',
      token: 'tok-solo',
    });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const vscode = await import('vscode');
    vi.spyOn(vscode.window, 'showQuickPick')
      .mockResolvedValueOnce({ label: 'Delete Profile...', action: 'deleteProfile' } as any)
      .mockResolvedValueOnce({ label: 'Solo', description: 'solo' } as any);
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Delete' as any);
    postedMessages = [];

    await provider.promptManageProfiles();

    expect(await detector.listProfiles()).toHaveLength(0);
    expect(mockSecrets['sonarAgent.token.solo']).toBeUndefined();
    expect(postedMessages.some((m) => m.type === 'state' && m.state === 'no-profiles')).toBe(true);
  });

  it('should include profile management entries in the configure menu', async () => {
    await detector.createProfile({
      name: 'Alpha',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 'tok-alpha',
    });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const vscode = await import('vscode');
    let captured: any[] = [];
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
      captured = items;
      return undefined;
    });

    await provider.promptConfigureConnection();

    const actions = captured.map((i) => i.action);
    expect(actions).toContain('switchProfile');
    expect(actions).toContain('newProfile');
    expect(actions).toContain('renameProfile');
    expect(actions).toContain('deleteProfile');
    expect(actions).toContain('verifyConnection');
    expect(actions).toContain('updateCredentials');
  });
});

describe('SonarOverviewViewProvider - Quality Gate widget', () => {
  let mockProjectDetector: any;
  let provider: SonarOverviewViewProvider;
  let mockWebviewView: any;
  let postedMessages: any[] = [];

  const errorGatePayload = {
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
      ],
    },
  };

  function stubFetch(handler: (url: string) => Promise<any>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => handler(String(url))),
    );
  }

  beforeEach(() => {
    // restoreAllMocks (not clearAllMocks): earlier suites spy on
    // SonarClient.prototype.getQualityGateStatus, and this suite needs the
    // real implementation against the stubbed fetch below.
    vi.restoreAllMocks();
    postedMessages = [];

    mockProjectDetector = {
      getConfig: vi.fn(async () => ({
        serverUrl: 'http://localhost:9000',
        projectKey: 'org.sample:project',
        hasToken: true,
      })),
      getToken: vi.fn(async () => 'sqp_valid_token_123'),
      setProjectKey: vi.fn(async () => {}),
      listProfiles: vi.fn(async () => []),
      getActiveProfile: vi.fn(async () => null),
    };

    mockWebviewView = {
      visible: true,
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview-test-resource:',
        postMessage: vi.fn(async (msg: any) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      },
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };

    provider = new SonarOverviewViewProvider(
      { fsPath: '/extension' } as any,
      mockProjectDetector as unknown as ProjectDetector,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function syncAndCollect() {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await provider.refresh();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return postedMessages.filter((m) => m.type === 'qualityGate');
  }

  it('should post {type: qualityGate} with the parsed ERROR status alongside overview data', async () => {
    stubFetch(async (url) => {
      if (url.includes('/api/qualitygates/project_status')) {
        return { ok: true, status: 200, json: async () => errorGatePayload };
      }
      throw new Error('connection refused');
    });

    const gateMessages = await syncAndCollect();

    expect(gateMessages.length).toBeGreaterThan(0);
    const last = gateMessages[gateMessages.length - 1];
    expect(last.status).toMatchObject({ status: 'ERROR' });
    expect(last.status.conditions).toHaveLength(1);
    expect(last.status.conditions[0]).toMatchObject({
      metricKey: 'coverage',
      actualValue: '62.4',
    });
  });

  it('should post {type: qualityGate, status: null} on HTTP 404 so the widget hides silently', async () => {
    stubFetch(async (url) => {
      if (url.includes('/api/qualitygates/project_status')) {
        return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
      }
      throw new Error('connection refused');
    });

    const gateMessages = await syncAndCollect();

    expect(gateMessages.length).toBeGreaterThan(0);
    const last = gateMessages[gateMessages.length - 1];
    expect(last.status).toBeNull();
  });

  it('should still deliver overview state messages when the gate request fails outright', async () => {
    stubFetch(async () => {
      throw new Error('connection refused');
    });

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await provider.refresh();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Overview pipeline is unaffected by the gate failure
    expect(postedMessages.some((m) => m.type === 'state')).toBe(true);
    const gateMessages = postedMessages.filter((m) => m.type === 'qualityGate');
    expect(gateMessages.length).toBeGreaterThan(0);
    expect(gateMessages[gateMessages.length - 1].status).toBeNull();
  });
});

describe('SonarOverviewViewProvider - Issue Lifecycle Actions', () => {
  let mockProjectDetector: any;
  let provider: SonarOverviewViewProvider;
  let mockWebviewView: any;
  let messageCallback: ((msg: any) => Promise<void>) | undefined;
  let postedMessages: any[] = [];
  let fetchCalls: { url: string; init: any }[] = [];

  const okJson = (data: any) => ({ ok: true, status: 200, json: async () => data });

  function stubFetch(handler: (url: string, init?: any) => Promise<any>) {
    fetchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return handler(String(url), init);
      }),
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    postedMessages = [];
    messageCallback = undefined;

    // Stub fetch before the provider is created: resolveWebviewView kicks off
    // a background _syncState, which must not hit the real network.
    stubFetch(async (url) => {
      if (url.includes('/api/issues/transitions')) return okJson({ transitions: [] });
      if (url.includes('/api/users/current')) return okJson({ login: 'alice' });
      if (url.includes('/api/issues/search')) return okJson({ issues: [] });
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    mockProjectDetector = {
      getConfig: vi.fn(async () => ({
        serverUrl: 'http://localhost:9000',
        projectKey: 'my-project',
        hasToken: true,
      })),
      getToken: vi.fn(async () => 'sqp_valid_token_123'),
      setProjectKey: vi.fn(async () => {}),
      listProfiles: vi.fn(async () => []),
      getActiveProfile: vi.fn(async () => null),
    };

    let visCb: (() => void) | undefined;
    let dispCb: (() => void) | undefined;
    mockWebviewView = {
      visible: true,
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview-test-resource:',
        postMessage: vi.fn(async (msg: any) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageCallback = cb;
          return { dispose: vi.fn() };
        }),
      },
      onDidChangeVisibility: vi.fn((cb: any) => {
        visCb = cb;
        return { dispose: vi.fn() };
      }),
      onDidDispose: vi.fn((cb: any) => {
        dispCb = cb;
        return { dispose: vi.fn() };
      }),
    };
    (mockWebviewView as any)._triggerVis = () => visCb?.();
    (mockWebviewView as any)._triggerDisp = () => dispCb?.();

    provider = new SonarOverviewViewProvider(
      { fsPath: '/extension' } as any,
      mockProjectDetector as unknown as ProjectDetector,
    );
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function send(msg: any) {
    expect(messageCallback).toBeDefined();
    await messageCallback!(msg);
  }

  it('forwards server transitions to the webview and caches them per issue key', async () => {
    stubFetch(async (url) => {
      if (url.includes('/api/issues/transitions?issue=ISSUE-1')) {
        return okJson({ transitions: ['confirm', 'falsepositive'] });
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    await send({ command: 'fetchIssueTransitions', issueKey: 'ISSUE-1' });

    const msgs = postedMessages.filter((m) => m.type === 'issueTransitions');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      issueKey: 'ISSUE-1',
      transitions: ['confirm', 'falsepositive'],
    });

    // Second request for the same issue is served from the host cache: no new transitions fetch.
    postedMessages = [];
    const transitionsCallsBefore = fetchCalls.filter((c) =>
      c.url.includes('/api/issues/transitions'),
    ).length;
    await send({ command: 'fetchIssueTransitions', issueKey: 'ISSUE-1' });
    expect(fetchCalls.filter((c) => c.url.includes('/api/issues/transitions'))).toHaveLength(
      transitionsCallsBefore,
    );
    expect(postedMessages.filter((m) => m.type === 'issueTransitions')).toHaveLength(1);
  });

  it('posts an empty transition list when the server call fails', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 500,
      statusText: 'Error',
      json: async () => ({}),
    }));

    await send({ command: 'fetchIssueTransitions', issueKey: 'ISSUE-9' });

    const msgs = postedMessages.filter((m) => m.type === 'issueTransitions');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ issueKey: 'ISSUE-9', transitions: [] });
  });

  it('is a no-op when the false-positive confirmation dialog is dismissed', async () => {
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
    stubFetch(async () => okJson({}));

    await send({ command: 'issueTransition', issueKey: 'ISSUE-1', transition: 'falsepositive' });

    expect(fetchCalls.some((c) => c.url.includes('/api/issues/do_transition'))).toBe(false);
  });

  it('applies a confirmed false-positive transition and re-fetches the issue list', async () => {
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(
      'Mark as False Positive' as any,
    );
    const infoSpy = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined as any);
    stubFetch(async (url) => {
      if (url.includes('/api/issues/do_transition')) return okJson({});
      if (url.includes('/api/issues/search')) return okJson({ issues: [] });
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    await send({ command: 'fetchDetails', category: 'reliability' });
    const detailsBefore = postedMessages.filter((m) => m.type === 'details').length;

    await send({ command: 'issueTransition', issueKey: 'ISSUE-1', transition: 'falsepositive' });

    const transitionCall = fetchCalls.find((c) => c.url.includes('/api/issues/do_transition'));
    expect(transitionCall).toBeDefined();
    expect(new URLSearchParams(String(transitionCall!.init.body)).get('transition')).toBe(
      'falsepositive',
    );
    expect(infoSpy).toHaveBeenCalledWith('Issue marked as false positive.');
    // The affected list is re-fetched so the UI reflects the change.
    expect(postedMessages.filter((m) => m.type === 'details').length).toBeGreaterThan(
      detailsBefore,
    );
  });

  it('shows the permission hint when the server rejects a transition with 403', async () => {
    const warnSpy = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue(undefined as any);
    stubFetch(async (url) => {
      if (url.includes('/api/issues/do_transition')) {
        return { ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    await send({ command: 'issueTransition', issueKey: 'ISSUE-1', transition: 'confirm' });

    expect(warnSpy).toHaveBeenCalledWith(
      'Your SonarQube token needs the "Administer Issues" permission for this action.',
    );
  });

  it('assignIssue resolves the current user and posts to /api/issues/assign', async () => {
    const infoSpy = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined as any);
    stubFetch(async (url) => {
      if (url.includes('/api/users/current')) return okJson({ login: 'alice' });
      if (url.includes('/api/issues/assign')) return okJson({});
      if (url.includes('/api/issues/search')) return okJson({ issues: [] });
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    await send({ command: 'fetchDetails', category: 'reliability' });
    await send({ command: 'assignIssue', issueKey: 'ISSUE-1' });

    const assignCall = fetchCalls.find((c) => c.url.includes('/api/issues/assign'));
    expect(assignCall).toBeDefined();
    const params = new URLSearchParams(String(assignCall!.init.body));
    expect(params.get('issue')).toBe('ISSUE-1');
    expect(params.get('assignee')).toBe('alice');
    expect(infoSpy).toHaveBeenCalledWith('Issue assigned to alice.');
  });

  it('addIssueComment posts the comment and ignores empty text', async () => {
    stubFetch(async (url) => {
      if (url.includes('/api/issues/add_comment')) return okJson({});
      if (url.includes('/api/issues/search')) return okJson({ issues: [] });
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });

    await send({ command: 'addIssueComment', issueKey: 'ISSUE-1', text: '   ' });
    expect(fetchCalls.some((c) => c.url.includes('/api/issues/add_comment'))).toBe(false);

    await send({ command: 'addIssueComment', issueKey: 'ISSUE-1', text: 'needs review' });
    const commentCall = fetchCalls.find((c) => c.url.includes('/api/issues/add_comment'));
    expect(commentCall).toBeDefined();
    expect(new URLSearchParams(String(commentCall!.init.body)).get('text')).toBe('needs review');
  });

  it('renders the overflow menu button only for real issue types in the webview html', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const html = mockWebviewView.webview.html as string;
    expect(html).toContain('toggleIssueMenu(card, item)');
    expect(html).toContain('issue-menu-popover');
    expect(html).toContain('fetchIssueTransitions');
  });

  it('handles webview lifecycle and miscellaneous commands', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Test log command
    await send({ command: 'log', text: 'Diagnostic message' });

    // Test selectProject command
    await send({ command: 'selectProject', projectKey: 'new.project.key' });
    expect(mockProjectDetector.setProjectKey).toHaveBeenCalledWith('new.project.key');

    // Test openProjectPicker command
    const promptPickerSpy = vi
      .spyOn(provider, 'promptProjectSelection')
      .mockResolvedValue(undefined as any);
    await send({ command: 'openProjectPicker' });
    expect(promptPickerSpy).toHaveBeenCalled();

    // Test createProfile command
    const createProfileSpy = vi
      .spyOn(provider, 'promptCreateProfile')
      .mockResolvedValue(undefined as any);
    await send({ command: 'createProfile' });
    expect(createProfileSpy).toHaveBeenCalled();

    // Test openFile command
    const openFileSpy = vi
      .spyOn((provider as any).fileNavigator, 'openFileAtLine')
      .mockResolvedValue(true);
    await send({ command: 'openFile', filePath: 'src/app.ts', line: 42 });
    expect(openFileSpy).toHaveBeenCalledWith('src/app.ts', 42);

    // Test sendToAgent and sendBatchToAgent
    const sendAgentSpy = vi
      .spyOn((provider as any).agentDispatcher, 'dispatchIssue')
      .mockResolvedValue(true as any);
    const sendBatchSpy = vi
      .spyOn((provider as any).agentDispatcher, 'dispatchBatch')
      .mockResolvedValue(true as any);
    await send({ command: 'sendToAgent', item: { id: '1' }, targetAgentId: 'copilot' });
    expect(sendAgentSpy).toHaveBeenCalledWith({ id: '1' }, { targetAgentId: 'copilot' });
    await send({ command: 'sendBatchToAgent', items: [{ id: '1' }], targetAgentId: 'copilot' });
    expect(sendBatchSpy).toHaveBeenCalledWith([{ id: '1' }], { targetAgentId: 'copilot' });

    // Test fetchDetails for hotspots, coverage, and duplications
    stubFetch(async (url) => {
      if (url.includes('/api/hotspots/search')) return okJson({ hotspots: [] });
      if (url.includes('/api/measures/component_tree')) return okJson({ components: [] });
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    await send({ command: 'fetchDetails', category: 'hotspots' });
    await send({ command: 'fetchDetails', category: 'coverage' });
    await send({ command: 'fetchDetails', category: 'duplications' });

    // Test setTargetAgent command
    await send({ command: 'setTargetAgent', agentId: 'claude-code' });

    // Test installSonarLint success and failure
    const execCmdSpy = vi
      .spyOn(vscode.commands, 'executeCommand')
      .mockResolvedValue(undefined as any);
    await send({ command: 'installSonarLint' });
    expect(execCmdSpy).toHaveBeenCalledWith(
      'workbench.extensions.installExtension',
      'sonarsource.sonarlint-vscode',
    );

    execCmdSpy.mockRejectedValueOnce(new Error('Network error'));
    await send({ command: 'installSonarLint' });
    expect(postedMessages.some((m) => m.type === 'error' && m.message === 'Network error')).toBe(
      true,
    );

    // Test message handler error posting
    (mockProjectDetector.setProjectKey as any).mockRejectedValueOnce(new Error('Boom!'));
    await send({ command: 'selectProject', projectKey: 'invalid' });
    expect(postedMessages.some((m) => m.type === 'error' && m.message === 'Boom!')).toBe(true);

    // Test visibility change to hidden and dispose
    mockWebviewView.visible = false;
    (mockWebviewView as any)._triggerVis();
    (mockWebviewView as any)._triggerDisp();

    // Test runCliScan already in progress
    (provider as any)._scanInProgress = true;
    const scanRes = await provider.handleRunCliScan();
    expect(scanRes.ok).toBe(false);
    expect(scanRes.errorMessage).toBe('Scan already in progress.');
  });
});
