import * as vscode from 'vscode';

export class Logger {
  private static channel?: vscode.LogOutputChannel;

  /**
   * Initializes the LogOutputChannel in VS Code's Output panel
   */
  public static initialize(channel?: vscode.LogOutputChannel): vscode.LogOutputChannel {
    if (channel) {
      this.channel = channel;
    } else {
      this.channel ??= vscode.window.createOutputChannel('Sonar Agent', { log: true });
    }
    return this.channel;
  }

  /**
   * Sanitizes log text to prevent leaking API URLs, query params, and tokens
   */
  public static sanitize(message: string): string {
    if (!message) return '';

    // Redact full URLs (http/https) to avoid showing API URLs or server hostnames
    let sanitized = message.replace(/https?:\/\/[^\s"'`<>]+/gi, '[SERVER]');

    // Redact bearer/token parameters or headers
    sanitized = sanitized.replace(
      /(token|bearer|authorization|password)\s*[:=]\s*[^\s,;&]+/gi,
      '$1: [REDACTED]',
    );

    return sanitized;
  }

  public static info(message: string): void {
    if (!this.channel) {
      this.initialize();
    }
    this.channel?.info(this.sanitize(message));
  }

  public static warn(message: string): void {
    if (!this.channel) {
      this.initialize();
    }
    this.channel?.warn(this.sanitize(message));
  }

  public static error(message: string, error?: unknown): void {
    if (!this.channel) {
      this.initialize();
    }
    let errorDetail = '';
    if (error) {
      if (error instanceof Error) {
        errorDetail = ` - ${error.message}`;
      } else if (typeof error === 'object') {
        try {
          errorDetail = ` - ${JSON.stringify(error)}`;
        } catch {
          errorDetail = ' - [Object]';
        }
      } else {
        errorDetail = ` - ${String(error)}`;
      }
    }
    this.channel?.error(this.sanitize(`${message}${errorDetail}`));
  }

  public static debug(message: string): void {
    if (!this.channel) {
      this.initialize();
    }
    this.channel?.debug(this.sanitize(message));
  }

  public static show(): void {
    this.channel?.show(true);
  }

  public static dispose(): void {
    this.channel?.dispose();
    this.channel = undefined;
  }
}
