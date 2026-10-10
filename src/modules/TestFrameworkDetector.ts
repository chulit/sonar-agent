import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

export interface TestFrameworkInfo {
  name: string;
  runnerCommand: string;
  mockingConventions: string;
  assertionSyntax: string;
  fileNamingConvention: string;
}

export interface TestFrameworkDetectorOptions {
  workspaceRoot?: string;
  readFileFn?: (filePath: string) => Promise<string | null>;
  fileExistsFn?: (filePath: string) => Promise<boolean>;
}

export class TestFrameworkDetector {
  private readonly workspaceRoot?: string;
  private readonly readFileFn: (filePath: string) => Promise<string | null>;
  private readonly fileExistsFn: (filePath: string) => Promise<boolean>;

  constructor(options?: TestFrameworkDetectorOptions) {
    this.workspaceRoot =
      options?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.readFileFn =
      options?.readFileFn ??
      (async (p: string) => {
        try {
          return await fs.readFile(p, 'utf-8');
        } catch {
          return null;
        }
      });
    this.fileExistsFn =
      options?.fileExistsFn ??
      (async (p: string) => {
        try {
          await fs.stat(p);
          return true;
        } catch {
          return false;
        }
      });
  }

  private resolvePath(fileName: string): string {
    return this.workspaceRoot ? path.join(this.workspaceRoot, fileName) : fileName;
  }

  /**
   * Generates convention-compliant test filename for target source file.
   */
  getTestFileName(targetFilePath?: string, frameworkName = 'Vitest'): string {
    if (!targetFilePath) {
      if (frameworkName === 'Go test') {
        return 'main_test.go';
      }
      if (frameworkName === 'Pytest') {
        return 'test_main.py';
      }
      return 'example.test.ts';
    }

    const base = path.basename(targetFilePath);
    const ext = path.extname(base);
    const nameWithoutExt = path.basename(base, ext);

    if (ext === '.go') {
      return `${nameWithoutExt}_test.go`;
    }
    if (ext === '.py') {
      return `test_${nameWithoutExt}.py`;
    }
    return `${nameWithoutExt}.test${ext || '.ts'}`;
  }

  /**
   * Inspects workspace manifests and returns detected test framework details.
   */
  async detectFramework(targetFilePath?: string): Promise<TestFrameworkInfo> {
    const ext = targetFilePath ? path.extname(targetFilePath).toLowerCase() : '';

    // 1. Check Go
    if (ext === '.go' || (await this.fileExistsFn(this.resolvePath('go.mod')))) {
      return {
        name: 'Go test',
        runnerCommand: 'go test -v ./...',
        mockingConventions: 'Use interfaces and struct-based mocks or testify/mock.',
        assertionSyntax: 'Use standard library testing.T (t.Run, t.Errorf) or testify/assert.',
        fileNamingConvention: this.getTestFileName(targetFilePath, 'Go test'),
      };
    }

    // 2. Check Python
    const hasPyProject = await this.fileExistsFn(this.resolvePath('pyproject.toml'));
    const hasPytestIni = await this.fileExistsFn(this.resolvePath('pytest.ini'));
    if (ext === '.py' || hasPyProject || hasPytestIni) {
      return {
        name: 'Pytest',
        runnerCommand: 'pytest',
        mockingConventions: 'Use unittest.mock (Mock, patch) or pytest-mock (mocker fixture).',
        assertionSyntax: 'Use standard assert statements with descriptive messages.',
        fileNamingConvention: this.getTestFileName(targetFilePath, 'Pytest'),
      };
    }

    // 3. Check JavaScript / TypeScript (package.json)
    const pkgContent = await this.readFileFn(this.resolvePath('package.json'));
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const allDeps: Record<string, unknown> = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if ('vitest' in allDeps) {
          return {
            name: 'Vitest',
            runnerCommand: 'npx vitest run',
            mockingConventions: 'Use vi.fn() and vi.spyOn() for mocks and spies.',
            assertionSyntax: 'Use expect(...) assertions from vitest.',
            fileNamingConvention: this.getTestFileName(targetFilePath, 'Vitest'),
          };
        }

        if ('jest' in allDeps || '@types/jest' in allDeps) {
          return {
            name: 'Jest',
            runnerCommand: 'npx jest',
            mockingConventions: 'Use jest.fn() and jest.spyOn() for mocks and spies.',
            assertionSyntax: 'Use expect(...) assertions from jest.',
            fileNamingConvention: this.getTestFileName(targetFilePath, 'Jest'),
          };
        }

        if ('mocha' in allDeps) {
          return {
            name: 'Mocha',
            runnerCommand: 'npx mocha',
            mockingConventions: 'Use sinon or mock functions for stubs and spies.',
            assertionSyntax: 'Use describe/it blocks with assert or chai expectations.',
            fileNamingConvention: this.getTestFileName(targetFilePath, 'Mocha'),
          };
        }
      } catch {
        // invalid JSON fallback
      }
    }

    // 4. Default fallback by extension
    if (ext === '.go') {
      return {
        name: 'Go test',
        runnerCommand: 'go test -v ./...',
        mockingConventions: 'Use interfaces and struct-based mocks.',
        assertionSyntax: 'Use standard library testing.T.',
        fileNamingConvention: this.getTestFileName(targetFilePath, 'Go test'),
      };
    }
    if (ext === '.py') {
      return {
        name: 'Pytest',
        runnerCommand: 'pytest',
        mockingConventions: 'Use unittest.mock (Mock, patch).',
        assertionSyntax: 'Use standard assert statements.',
        fileNamingConvention: this.getTestFileName(targetFilePath, 'Pytest'),
      };
    }

    // Default JS/TS fallback
    return {
      name: 'Vitest',
      runnerCommand: 'npx vitest run',
      mockingConventions: 'Use vi.fn() and vi.spyOn() for mocks and spies.',
      assertionSyntax: 'Use expect(...) assertions.',
      fileNamingConvention: this.getTestFileName(targetFilePath, 'Vitest'),
    };
  }
}
