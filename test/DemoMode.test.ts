import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { DemoData } from '../src/modules/DemoData.js';

describe('SonarOverviewViewProvider - Demo Mode', () => {
  let mockProjectDetector: any;
  let mockConfig: any;
  let mockToken: string | undefined;
  let provider: SonarOverviewViewProvider;
  let mockWebviewView: any;
  let messageCallback: ((msg: any) => Promise<void>) | undefined;
  let postedMessages: any[] = [];
  let dispatchedIssues: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    postedMessages = [];
    dispatchedIssues = [];

    mockConfig = {
      serverUrl: '',
      projectKey: '',
      hasToken: false,
    };
    mockToken = undefined;

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
        asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
      },
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    };

    const mockExtensionUri = vscode.Uri.file('/mock/extension/path');
    provider = new SonarOverviewViewProvider(mockExtensionUri, mockProjectDetector);

    // Mock agent dispatcher dispatchIssue
    (provider as any).agentDispatcher = {
      getAvailableAgents: vi.fn(() => [{ id: 'copilot', name: 'GitHub Copilot' }]),
      dispatchIssue: vi.fn(async (item: any, opts: any) => {
        dispatchedIssues.push({ item, opts });
        return { ok: true, message: 'Dispatched' };
      }),
      dispatchBatch: vi.fn(async (items: any[], opts: any) => {
        return { ok: true, message: 'Batch dispatched' };
      }),
    };
  });

  it('renders "Try Demo Mode" buttons in webview HTML', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const html = mockWebviewView.webview.html;
    expect(html).toContain('try-demo-btn');
    expect(html).toContain('no-profiles-demo-btn');
    expect(html).toContain('exit-demo-btn');
    expect(html).toContain('demo-banner');
  });

  it('activates Demo Mode when enableDemoMode message is received', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(provider.isDemoMode).toBe(false);

    postedMessages = [];
    await messageCallback?.({ command: 'enableDemoMode' });

    expect(provider.isDemoMode).toBe(true);

    const stateMsg = postedMessages.find((m) => m.type === 'state' && m.isDemoMode);
    expect(stateMsg).toBeDefined();
    expect(stateMsg.state).toBe('connected');
    expect(stateMsg.projectKey).toBe('demo-sample-project');
    expect(stateMsg.overview).toBeDefined();
    expect(stateMsg.overview.reliability.count).toBe(5);

    const qgMsg = postedMessages.find((m) => m.type === 'qualityGate');
    expect(qgMsg).toBeDefined();
    expect(qgMsg.status.status).toBe('ERROR');
  });

  it('returns demo detail items when fetchDetails is called in Demo Mode', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await messageCallback?.({ command: 'enableDemoMode' });

    postedMessages = [];
    await messageCallback?.({ command: 'fetchDetails', category: 'security' });

    const detailsMsg = postedMessages.find((m) => m.type === 'details');
    expect(detailsMsg).toBeDefined();
    expect(detailsMsg.category).toBe('security');
    expect(detailsMsg.items.length).toBeGreaterThan(0);
    expect(detailsMsg.items.every((i: any) => i.type === 'VULNERABILITY')).toBe(true);
  });

  it('dispatches demo issues to agent dispatcher in Demo Mode', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await messageCallback?.({ command: 'enableDemoMode' });

    const sampleIssue = DemoData.getDetails('reliability')[0];
    await messageCallback?.({
      command: 'sendToAgent',
      item: sampleIssue,
      targetAgentId: 'copilot',
    });

    expect(dispatchedIssues.length).toBe(1);
    expect(dispatchedIssues[0].item.id).toBe(sampleIssue.id);
    expect(dispatchedIssues[0].opts.targetAgentId).toBe('copilot');
  });

  it('exits Demo Mode and returns to unconfigured state when disableDemoMode message is received', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await messageCallback?.({ command: 'enableDemoMode' });
    expect(provider.isDemoMode).toBe(true);

    postedMessages = [];
    await messageCallback?.({ command: 'disableDemoMode' });

    expect(provider.isDemoMode).toBe(false);
    const stateMsg = postedMessages.find((m) => m.type === 'state');
    expect(stateMsg).toBeDefined();
    expect(stateMsg.state).not.toBe('connected');
  });

  it('persists demo mode across refresh', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await messageCallback?.({ command: 'enableDemoMode' });
    expect(provider.isDemoMode).toBe(true);

    postedMessages = [];
    await provider.refresh();

    expect(provider.isDemoMode).toBe(true);
    const stateMsg = postedMessages.find((m) => m.type === 'state' && m.isDemoMode);
    expect(stateMsg).toBeDefined();
  });
});
