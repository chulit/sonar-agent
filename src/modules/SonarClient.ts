export interface SonarClientConfig {
  serverUrl: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export interface VerificationResult {
  ok: boolean;
  message?: string;
}

export class SonarClient {
  private readonly serverUrl: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: SonarClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.token) {
      return {};
    }
    const encoded = Buffer.from(`${this.token}:`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  /**
   * Validates credentials against SonarQube /api/authentication/validate
   */
  async verifyConnection(): Promise<VerificationResult> {
    try {
      const url = `${this.serverUrl}/api/authentication/validate`;
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...this.getAuthHeader(),
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message: `Authentication failed (HTTP ${response.status}). Please verify your token.`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          message: `Server returned HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { valid?: boolean };
      if (data && data.valid === true) {
        return { ok: true };
      }

      return {
        ok: false,
        message: "Invalid credentials: SonarQube reported token as invalid.",
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Cannot reach SonarQube server at ${this.serverUrl}: ${err.message || String(err)}`,
      };
    }
  }
}
