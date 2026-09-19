import { describe, it, expect, vi, beforeEach } from 'vitest';
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
