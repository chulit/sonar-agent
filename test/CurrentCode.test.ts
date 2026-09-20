import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { SonarClient } from '../src/modules/SonarClient.js';

function makeDetector() {
  return {
    getConfig: vi.fn(async () => ({
      serverUrl: 'http://localhost:9000',
      projectKey: 'p:k',
      hasToken: true,
    })),
    getToken: vi.fn(async () => 'tok'),
    setServerUrl: vi.fn(async () => {}),
    setToken: vi.fn(async () => {}),
    deleteToken: vi.fn(async () => {}),
    setProjectKey: vi.fn(async () => {}),
    listProfiles: vi.fn(async () => []),
    getActiveProfile: vi.fn(async () => null),
  };
}

function makeView() {
  const posted: any[] = [];
  let messageCallback: ((msg: any) => Promise<void>) | undefined;
  const view: any = {
    visible: true,
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-webview-test-resource:',
      postMessage: vi.fn(async (msg: any) => {
        posted.push(msg);
        return true;
      }),
      onDidReceiveMessage: vi.fn((cb: any) => {
        messageCallback = cb;
        return { dispose: vi.fn() };
      }),
    },
    onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  };
  return { view, posted, getMessageCallback: () => messageCallback };
}

describe('Current Code settings & tab switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SonarClient.prototype, 'fetchProjects').mockResolvedValue([]);
    vi.spyOn(SonarClient.prototype, 'getOverview').mockResolvedValue({
      security: { count: 0, rating: 'A' },
      reliability: { count: 0, rating: 'A' },
      maintainability: { count: 0, rating: 'A' },
      acceptedIssues: { count: 0 },
      coverage: { percentage: 80, linesToCover: 100 },
      duplications: { percentage: 1, duplicatedLines: 10 },
      securityHotspots: { count: 0, rating: 'A' },
    } as never);
  });

  it('renders tab bar and panels when currentCode.enabled is true', () => {
    const provider = new SonarOverviewViewProvider(
      { fsPath: '/ext' } as never,
      makeDetector() as never,
    );
    const { view } = makeView();
    provider.resolveWebviewView(view, {} as never, {} as never);
    expect(view.webview.html).toContain('id="tab-bar"');
    expect(view.webview.html).toContain('id="tab-overall"');
    expect(view.webview.html).toContain('id="tab-current"');
    expect(view.webview.html).toContain('id="overall-tab-panel"');
    expect(view.webview.html).toContain('id="current-tab-panel"');
  });

  it('omits the tab bar and registers no listener when currentCode.enabled is false', async () => {
    const getConfig = vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, def?: unknown) => (key === 'currentCode.enabled' ? false : (def as never)),
      update: async () => {},
    } as never);
    try {
      const localScanner: any = {
        getLocalDiagnostics: vi.fn(() => []),
        onDiagnosticsChanged: vi.fn(() => ({ dispose: vi.fn() })),
        isSonarLintInstalled: vi.fn(() => true),
        runCliScan: vi.fn(async () => ({ ok: true })),
      };
      const provider = new SonarOverviewViewProvider(
        { fsPath: '/ext' } as never,
        makeDetector() as never,
        undefined,
        undefined,
        undefined,
        undefined,
        localScanner,
        '/workspace',
      );
      const { view, posted, getMessageCallback } = makeView();
      provider.resolveWebviewView(view, {} as never, {} as never);
      expect(view.webview.html).not.toContain('id="tab-bar"');
      expect(provider.isCurrentCodeEnabled()).toBe(false);
      const cb = getMessageCallback();
      await cb!({ command: 'switchTab', tab: 'currentCode' });
      expect(localScanner.onDiagnosticsChanged).not.toHaveBeenCalled();
      expect(posted.some((m) => m.type === 'currentCodeItems')).toBe(false);
    } finally {
      getConfig.mockRestore();
    }
  });

  it('handles switchTab message with tabState response and live items', async () => {
    const items = [
      {
        id: 'src/a.ts:1:x:S1:m',
        ruleKey: 'x:S1',
        message: 'm',
        component: 'src/a.ts',
        filePath: 'src/a.ts',
        line: 1,
        type: 'CODE_SMELL',
        severity: 'MAJOR',
        status: 'OPEN',
        tags: ['sonarlint'],
        creationDate: new Date().toISOString(),
        source: 'sonarlint',
      },
    ];
    const localScanner: any = {
      getLocalDiagnostics: vi.fn(() => items),
      onDiagnosticsChanged: vi.fn(() => ({ dispose: vi.fn() })),
      isSonarLintInstalled: vi.fn(() => true),
      runCliScan: vi.fn(async () => ({ ok: true })),
    };
    const provider = new SonarOverviewViewProvider(
      { fsPath: '/ext' } as never,
      makeDetector() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      localScanner,
      '/workspace',
    );
    const { view, posted, getMessageCallback } = makeView();
    provider.resolveWebviewView(view, {} as never, {} as never);
    const cb = getMessageCallback();
    await cb!({ command: 'switchTab', tab: 'currentCode' });
    expect(posted.some((m) => m.type === 'tabState' && m.activeTab === 'currentCode')).toBe(true);
    expect(posted.some((m) => m.type === 'currentCodeItems')).toBe(true);
    expect(posted.some((m) => m.type === 'currentCodeCount' && m.count === 1)).toBe(true);
    expect(provider.getActiveTab()).toBe('currentCode');
    await cb!({ command: 'switchTab', tab: 'overallCode' });
    expect(provider.getActiveTab()).toBe('overallCode');
  });

  it('runCliScan success refreshes from server and toggles scanStatus', async () => {
    const localScanner: any = {
      getLocalDiagnostics: vi.fn(() => []),
      onDiagnosticsChanged: vi.fn(() => ({ dispose: vi.fn() })),
      isSonarLintInstalled: vi.fn(() => true),
      runCliScan: vi.fn(async () => ({ ok: true })),
    };
    const serverItems = [
      {
        id: 'k1',
        ruleKey: 'r',
        message: 'server issue',
        component: 'c',
        filePath: 'src/a.ts',
        line: 2,
        type: 'BUG',
        severity: 'MAJOR',
        status: 'OPEN',
        tags: [],
        creationDate: new Date().toISOString(),
      },
    ];
    vi.spyOn(SonarClient.prototype, 'getIssues').mockResolvedValue(serverItems as never);
    const provider = new SonarOverviewViewProvider(
      { fsPath: '/ext' } as never,
      makeDetector() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      localScanner,
      '/workspace',
    );
    const { view, posted, getMessageCallback } = makeView();
    provider.resolveWebviewView(view, {} as never, {} as never);
    const cb = getMessageCallback();
    posted.length = 0;
    await cb!({ command: 'runCliScan' });
    expect(localScanner.runCliScan).toHaveBeenCalled();
    expect(posted.some((m) => m.type === 'scanStatus' && m.scanning === true)).toBe(true);
    expect(posted.some((m) => m.type === 'scanStatus' && m.scanning === false)).toBe(true);
    expect(posted.some((m) => m.type === 'currentCodeItems')).toBe(true);
  });

  it('runCliScan failure posts an error message', async () => {
    const localScanner: any = {
      getLocalDiagnostics: vi.fn(() => []),
      onDiagnosticsChanged: vi.fn(() => ({ dispose: vi.fn() })),
      isSonarLintInstalled: vi.fn(() => false),
      runCliScan: vi.fn(async () => ({ ok: false, errorMessage: 'boom failed' })),
    };
    const provider = new SonarOverviewViewProvider(
      { fsPath: '/ext' } as never,
      makeDetector() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      localScanner,
      '/workspace',
    );
    const { view, posted, getMessageCallback } = makeView();
    provider.resolveWebviewView(view, {} as never, {} as never);
    const cb = getMessageCallback();
    posted.length = 0;
    await cb!({ command: 'runCliScan' });
    expect(
      posted.some((m) => m.type === 'error' && String(m.message).includes('boom failed')),
    ).toBe(true);
  });
});
