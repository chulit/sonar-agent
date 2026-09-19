export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  findFiles: async () => [],
  openTextDocument: async () => ({}),
  getConfiguration: () => ({
    get: (key: string, def?: any) => def,
    update: async () => {},
  }),
};

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
};

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export const window = {
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
