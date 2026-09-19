import { describe, it, expect, vi } from "vitest";
import { FileNavigator } from "../src/modules/FileNavigator.js";

describe("FileNavigator - Path Resolution", () => {
  it("should resolve exact relative path when file exists in workspace", async () => {
    const fileExistsFn = vi.fn().mockImplementation(async (p: string) => {
      return p === "/my-workspace/src/app.ts";
    });

    const navigator = new FileNavigator({
      workspaceRoot: "/my-workspace",
      fileExistsFn,
    });

    const resolved = await navigator.resolveFilePath("src/app.ts");
    expect(resolved).toBe("/my-workspace/src/app.ts");
    expect(fileExistsFn).toHaveBeenCalledWith("/my-workspace/src/app.ts");
  });

  it("should fallback to search by basename when relative path has module prefix", async () => {
    const fileExistsFn = vi.fn().mockResolvedValue(false);
    const findFilesFn = vi.fn().mockResolvedValue(["/my-workspace/packages/core/src/app.ts"]);

    const navigator = new FileNavigator({
      workspaceRoot: "/my-workspace",
      fileExistsFn,
      findFilesFn,
    });

    const resolved = await navigator.resolveFilePath("sonar-module/src/app.ts");
    expect(resolved).toBe("/my-workspace/packages/core/src/app.ts");
    expect(findFilesFn).toHaveBeenCalledWith("**/app.ts");
  });

  it("should return null if file cannot be found anywhere", async () => {
    const fileExistsFn = vi.fn().mockResolvedValue(false);
    const findFilesFn = vi.fn().mockResolvedValue([]);

    const navigator = new FileNavigator({
      workspaceRoot: "/my-workspace",
      fileExistsFn,
      findFilesFn,
    });

    const resolved = await navigator.resolveFilePath("non-existent.ts");
    expect(resolved).toBeNull();
  });
});
