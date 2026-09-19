import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectDetector, SecretStorageLike, WorkspaceConfigLike } from "../src/modules/ProjectDetector.js";

describe("ProjectDetector - Configuration and Secrets", () => {
  let mockSecrets: Record<string, string>;
  let secretStorage: SecretStorageLike;
  let mockConfig: Record<string, any>;
  let workspaceConfig: WorkspaceConfigLike;

  beforeEach(() => {
    mockSecrets = {};
    secretStorage = {
      get: vi.fn(async (key: string) => mockSecrets[key]),
      store: vi.fn(async (key: string, value: string) => {
        mockSecrets[key] = value;
      }),
      delete: vi.fn(async (key: string) => {
        delete mockSecrets[key];
      }),
    };

    mockConfig = {};
    workspaceConfig = {
      get: vi.fn((key: string, defaultValue?: any) => mockConfig[key] ?? defaultValue),
      update: vi.fn(async (key: string, value: any) => {
        mockConfig[key] = value;
      }),
    };
  });

  it("should detect when no serverUrl or token are configured", async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    const config = await detector.getConfig();

    expect(config.serverUrl).toBe("");
    expect(config.hasToken).toBe(false);
  });

  it("should save and retrieve token securely using secret storage", async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    await detector.setToken("sqp_my_secret_token");

    expect(secretStorage.store).toHaveBeenCalledWith("sonarAgent.token", "sqp_my_secret_token");
    const token = await detector.getToken();
    expect(token).toBe("sqp_my_secret_token");

    const config = await detector.getConfig();
    expect(config.hasToken).toBe(true);
  });

  it("should save serverUrl to workspace configuration", async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    await detector.setServerUrl("http://localhost:9000");

    expect(workspaceConfig.update).toHaveBeenCalledWith("serverUrl", "http://localhost:9000", true);
  });

  it("should clear token on reset", async () => {
    mockSecrets["sonarAgent.token"] = "existing-token";
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });

    await detector.deleteToken();
    expect(secretStorage.delete).toHaveBeenCalledWith("sonarAgent.token");
    expect(await detector.getToken()).toBeUndefined();
  });
});
