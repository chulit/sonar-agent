import { vi } from 'vitest';

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  findFiles: async () => [],
  openTextDocument: async () => ({}),
  asRelativePath: (uri: any) => (typeof uri === 'string' ? uri : (uri?.fsPath ?? uri?.path ?? '')),
  getConfiguration: () => ({
    get: (key: string, def?: any) => def,
    update: async () => {},
  }),
};

export const extensions = {
  getExtension: (_id: string) => undefined,
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export const env = {
  clipboard: {
    writeText: async () => {},
    readText: async () => '',
  },
};

export const commands = {
  executeCommand: async () => {},
  registerCommand: () => ({ dispose: () => {} }),
};

export const languages = {
  createDiagnosticCollection: () => ({
    clear: () => {},
    set: () => {},
    delete: () => {},
    dispose: () => {},
  }),
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerCodeLensProvider: () => ({ dispose: () => {} }),
  getDiagnostics: (): Array<readonly [unknown, any[]]> => [],
  onDidChangeDiagnostics: (_listener: (e: any) => void) => ({ dispose: () => {} }),
};

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export class MarkdownString {
  public value: string;
  public isTrusted?: boolean;
  public supportThemeIcons?: boolean;
  constructor(value = '') {
    this.value = value;
  }
  appendMarkdown(value: string) {
    this.value += value;
    return this;
  }
  appendText(value: string) {
    this.value += value;
    return this;
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export const window = {
  createStatusBarItem: (_alignment?: number, _priority?: number) => ({
    text: '',
    tooltip: '' as any,
    command: '',
    color: undefined as any,
    backgroundColor: undefined as any,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }),
  showTextDocument: async () => ({
    selection: {},
    revealRange: () => {},
  }),
  showWarningMessage: async () => {},
  showErrorMessage: async () => {},
  showInformationMessage: async () => {},
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  withProgress: async (_opts: any, task: any) => task({ report: () => {} }),
  createOutputChannel: (name: string, _options?: any) => ({
    name,
    append: () => {},
    appendLine: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
  }),
  registerWebviewViewProvider: (_viewType: string, _provider: any) => ({ dispose: () => {} }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
};

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(
    startOrStartLine: Position | number,
    endOrStartCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrStartLine === 'number') {
      this.start = new Position(startOrStartLine, endOrStartCharacter as number);
      this.end = new Position(
        endLine ?? startOrStartLine,
        endCharacter ?? (endOrStartCharacter as number),
      );
    } else {
      this.start = startOrStartLine;
      this.end = endOrStartCharacter as Position;
    }
  }
}

export class Selection extends Range {
  constructor(anchor: Position, active: Position) {
    super(anchor, active);
  }
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  public source?: string;
  public code?: string | number | { value: string | number; target: any };
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export class CodeActionKind {
  public static readonly Empty = new CodeActionKind('');
  public static readonly QuickFix = new CodeActionKind('quickfix');
  public static readonly Refactor = new CodeActionKind('refactor');
  public static readonly Source = new CodeActionKind('source');
  constructor(public readonly value: string) {}
}

export enum CodeActionTriggerKind {
  Invoke = 1,
  Automatic = 2,
}

export class CodeAction {
  public command?: { command: string; title: string; arguments?: any[] };
  public diagnostics?: Diagnostic[];
  public isPreferred?: boolean;
  constructor(
    public title: string,
    public kind?: CodeActionKind,
  ) {}
}

export class CodeLens {
  constructor(
    public range: Range,
    public command?: { command: string; title: string; arguments?: any[] },
  ) {}
}

export class EventEmitter<T = any> {
  private listeners: Array<(e: T) => any> = [];
  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };
  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}
