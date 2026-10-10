import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { TestFrameworkDetector } from '../src/modules/TestFrameworkDetector.js';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';

describe('TestFrameworkDetector & Coverage Gap Test Generator', () => {
  const sampleCoverageItem: SonarDetailItem = {
    id: 'cov-1',
    ruleKey: 'coverage:uncovered_lines',
    message: '34 uncovered lines (42% coverage)',
    component: 'src/services/PaymentService.ts',
    filePath: 'src/services/PaymentService.ts',
    line: 1,
    type: 'COVERAGE',
    severity: 'CRITICAL',
    status: 'OPEN',
    tags: ['test-coverage', 'unit-test'],
    creationDate: '2026-10-09T08:30:00Z',
  };

  describe('TestFrameworkDetector', () => {
    it('detects Vitest from package.json devDependencies', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async (filePath) => {
          if (filePath.endsWith('package.json')) {
            return JSON.stringify({
              devDependencies: { vitest: '^1.6.0' },
            });
          }
          return null;
        },
        fileExistsFn: async (filePath) => filePath.endsWith('package.json'),
      });

      const framework = await detector.detectFramework('src/services/PaymentService.ts');
      expect(framework.name).toBe('Vitest');
      expect(framework.runnerCommand).toContain('vitest');
      expect(framework.mockingConventions).toContain('vi.fn');
      expect(framework.assertionSyntax).toContain('expect');
      expect(framework.fileNamingConvention).toBe('PaymentService.test.ts');
    });

    it('detects Jest from package.json dependencies', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async (filePath) => {
          if (filePath.endsWith('package.json')) {
            return JSON.stringify({
              devDependencies: { jest: '^29.0.0', '@types/jest': '^29.0.0' },
            });
          }
          return null;
        },
        fileExistsFn: async (filePath) => filePath.endsWith('package.json'),
      });

      const framework = await detector.detectFramework('src/controllers/OrderController.js');
      expect(framework.name).toBe('Jest');
      expect(framework.runnerCommand).toContain('jest');
      expect(framework.mockingConventions).toContain('jest.fn');
      expect(framework.fileNamingConvention).toBe('OrderController.test.js');
    });

    it('detects Mocha from package.json devDependencies', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async (filePath) => {
          if (filePath.endsWith('package.json')) {
            return JSON.stringify({
              devDependencies: { mocha: '^10.0.0' },
            });
          }
          return null;
        },
        fileExistsFn: async (filePath) => filePath.endsWith('package.json'),
      });

      const framework = await detector.detectFramework('src/parser/QueryParser.ts');
      expect(framework.name).toBe('Mocha');
      expect(framework.runnerCommand).toContain('mocha');
    });

    it('detects Go test when go.mod exists', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async (filePath) => {
          if (filePath.endsWith('go.mod')) {
            return 'module example.com/payment\ngo 1.22';
          }
          return null;
        },
        fileExistsFn: async (filePath) => filePath.endsWith('go.mod'),
      });

      const framework = await detector.detectFramework('pkg/payment/service.go');
      expect(framework.name).toBe('Go test');
      expect(framework.runnerCommand).toContain('go test');
      expect(framework.fileNamingConvention).toBe('service_test.go');
    });

    it('detects Pytest when pyproject.toml or pytest.ini exists', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async (filePath) => {
          if (filePath.endsWith('pyproject.toml')) {
            return '[tool.pytest.ini_options]\nminversion = "7.0"';
          }
          return null;
        },
        fileExistsFn: async (filePath) => filePath.endsWith('pyproject.toml'),
      });

      const framework = await detector.detectFramework('services/user_service.py');
      expect(framework.name).toBe('Pytest');
      expect(framework.runnerCommand).toContain('pytest');
      expect(framework.fileNamingConvention).toBe('test_user_service.py');
    });

    it('falls back to language-appropriate defaults when no manifests exist', async () => {
      const detector = new TestFrameworkDetector({
        readFileFn: async () => null,
        fileExistsFn: async () => false,
      });

      const tsFramework = await detector.detectFramework('src/index.ts');
      expect(tsFramework.name).toBe('Vitest');

      const goFramework = await detector.detectFramework('cmd/main.go');
      expect(goFramework.name).toBe('Go test');

      const pyFramework = await detector.detectFramework('app/main.py');
      expect(pyFramework.name).toBe('Pytest');
    });
  });

  describe('AgentDispatcher & Coverage Gap Prompt Assembly', () => {
    let dispatcher: AgentDispatcher;

    beforeEach(() => {
      const mockDetector = new TestFrameworkDetector({
        readFileFn: async () =>
          JSON.stringify({
            devDependencies: { vitest: '^1.6.0' },
          }),
        fileExistsFn: async (filePath) => filePath.endsWith('package.json'),
      });

      dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: (id) => id === 'github.copilot',
        isAntigravityEnvFn: () => false,
        readCodeSnippetFn: async () => ({
          snippet: 'export function processPayment(amount: number) { ... }',
          startLine: 1,
          endLine: 20,
          language: 'typescript',
        }),
      });
      (dispatcher as any).testFrameworkDetector = mockDetector;
    });

    it('assembles enriched coverage prompt specifying detected framework and instructions', async () => {
      const prompt = await dispatcher.assemblePrompt(sampleCoverageItem);

      expect(prompt).toContain('@workspace Please generate unit tests to improve test coverage');
      expect(prompt).toContain('`src/services/PaymentService.ts`');
      expect(prompt).toContain('34 uncovered lines (42% coverage)');
      expect(prompt).toContain('Vitest');
      expect(prompt).toContain('vi.fn');
      expect(prompt).toContain('processPayment');
      expect(prompt).toContain('80%+');
    });

    it('dispatches coverage prompt to active AI agent', async () => {
      const executeCommandSpy = vi
        .spyOn(vscode.commands, 'executeCommand')
        .mockResolvedValue(undefined as any);

      const result = await dispatcher.dispatchIssue(sampleCoverageItem, {
        targetAgentId: 'copilot',
      });
      expect(result.ok).toBe(true);
      expect(executeCommandSpy).toHaveBeenCalledWith(
        'workbench.action.chat.open',
        expect.objectContaining({
          query: expect.stringContaining(
            '@workspace Please generate unit tests to improve test coverage',
          ),
        }),
      );
    });
  });

  describe('SonarOverviewViewProvider.generateMissingTests', () => {
    let provider: SonarOverviewViewProvider;
    let mockDetector: any;
    let mockDispatcher: any;

    beforeEach(() => {
      mockDetector = {
        getConfig: vi
          .fn()
          .mockResolvedValue({ serverUrl: 'http://localhost:9000', projectKey: 'test' }),
        getToken: vi.fn().mockResolvedValue('test-token'),
        isConfiguredSync: vi.fn().mockReturnValue(true),
      };

      mockDispatcher = {
        dispatchIssue: vi.fn().mockResolvedValue({ ok: true, message: 'Dispatched to Copilot' }),
        getAvailableAgents: vi.fn().mockReturnValue([{ id: 'copilot', name: 'GitHub Copilot' }]),
      };

      provider = new SonarOverviewViewProvider(
        vscode.Uri.file('/fake/extension'),
        mockDetector as any,
        undefined,
        mockDispatcher as any,
      );
    });

    it('generates tests for an explicit coverage SonarDetailItem', async () => {
      const result = await provider.generateMissingTests(sampleCoverageItem);
      expect(result.ok).toBe(true);
      expect(mockDispatcher.dispatchIssue).toHaveBeenCalledWith(
        sampleCoverageItem,
        expect.any(Object),
      );
    });

    it('generates tests for active text document when no item is passed', async () => {
      const doc = {
        uri: vscode.Uri.file('/workspace/src/utils/Calculator.ts'),
        fileName: '/workspace/src/utils/Calculator.ts',
      } as vscode.TextDocument;

      const result = await provider.generateMissingTests(doc);
      expect(result.ok).toBe(true);
      expect(mockDispatcher.dispatchIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COVERAGE',
          filePath: 'src/utils/Calculator.ts',
        }),
        expect.any(Object),
      );
    });

    it('shows notification and exits when no active file is open', async () => {
      const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
      const originalActive = vscode.window.activeTextEditor;
      (vscode.window as any).activeTextEditor = undefined;

      try {
        const result = await provider.generateMissingTests();
        expect(result.ok).toBe(false);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('No active file'));
      } finally {
        (vscode.window as any).activeTextEditor = originalActive;
      }
    });

    it('responds to webview postMessage generateMissingTests command', async () => {
      const genSpy = vi.spyOn(provider, 'generateMissingTests').mockResolvedValue({
        ok: true,
        message: 'Success',
      });

      let messageListener: any;
      const fakeWebviewView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn((listener) => {
            messageListener = listener;
          }),
          postMessage: vi.fn(),
        },
        visible: true,
        onDidChangeVisibility: vi.fn(),
      };

      provider.resolveWebviewView(fakeWebviewView as any, {} as any, {} as any);
      await messageListener({ command: 'generateMissingTests', item: sampleCoverageItem });
      expect(genSpy).toHaveBeenCalledWith(sampleCoverageItem, undefined);
    });
  });
});
