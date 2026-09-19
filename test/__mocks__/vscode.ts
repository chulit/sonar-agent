export const workspace = {
  workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
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
    readText: async () => "",
  },
};

export const commands = {
  executeCommand: async () => {},
  registerCommand: () => ({ dispose: () => {} }),
};

export const window = {
  showTextDocument: async () => ({
    selection: {},
    revealRange: () => {},
  }),
  showWarningMessage: async () => {},
  showErrorMessage: async () => {},
  showInformationMessage: async () => {},
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
};

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
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
