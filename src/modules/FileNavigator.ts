import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as vscode from "vscode";

export interface FileNavigatorOptions {
  workspaceRoot?: string;
  fileExistsFn?: (fullPath: string) => Promise<boolean>;
  findFilesFn?: (pattern: string) => Promise<string[]>;
}

export class FileNavigator {
  private readonly workspaceRoot?: string;
  private readonly fileExistsFn: (fullPath: string) => Promise<boolean>;
  private readonly findFilesFn: (pattern: string) => Promise<string[]>;

  constructor(options?: FileNavigatorOptions) {
    this.workspaceRoot = options?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

    this.findFilesFn =
      options?.findFilesFn ??
      (async (pattern: string) => {
        const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 5);
        return uris.map((u) => u.fsPath);
      });
  }

  /**
   * Resolves SonarQube component path to an absolute local file path.
   */
  async resolveFilePath(relativePath: string): Promise<string | null> {
    if (!this.workspaceRoot) {
      return null;
    }

    // 1. Direct path check
    const directPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(this.workspaceRoot, relativePath);

    if (await this.fileExistsFn(directPath)) {
      return directPath;
    }

    // 2. Fallback: Search by basename for monorepos or prefixed paths
    const fileName = path.basename(relativePath);
    if (fileName) {
      const matches = await this.findFilesFn(`**/${fileName}`);
      if (matches && matches.length > 0) {
        return matches[0];
      }
    }

    return null;
  }

  /**
   * Opens the file in VS Code editor and navigates cursor to specified line.
   */
  async openFileAtLine(filePath: string, line?: number): Promise<boolean> {
    const resolvedPath = await this.resolveFilePath(filePath);
    if (!resolvedPath) {
      vscode.window.showWarningMessage(`Could not find file locally: ${filePath}`);
      return false;
    }

    try {
      const uri = vscode.Uri.file(resolvedPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });

      if (line !== undefined && line > 0) {
        const lineIndex = line - 1;
        const pos = new vscode.Position(lineIndex, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter
        );
      }

      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${err.message || String(err)}`);
      return false;
    }
  }
}
