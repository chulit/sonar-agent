import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentDispatcher } from "../src/modules/AgentDispatcher.js";
import { SonarDetailItem } from "../src/modules/SonarClient.js";

describe("AgentDispatcher - Enriched Fix Prompt Assembly", () => {
  const sampleItem: SonarDetailItem = {
    id: "ISSUE-1",
    ruleKey: "vue:S123",
    message: 'Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.',
    component: "my-project:resources/survey/components/widgets/TugasCardGrid.vue",
    filePath: "resources/survey/components/widgets/TugasCardGrid.vue",
    line: 168,
    type: "BUG",
    severity: "MAJOR",
    status: "OPEN",
    effort: "5min",
    tags: ["accessibility", "react"],
    creationDate: "2026-09-13T10:00:00+0000",
  };

  const sampleRule = {
    key: "vue:S123",
    name: "ARIA roles validity",
    cleanDesc: "Elements with ARIA roles must use a valid, non-abstract ARIA role to ensure accessibility.",
    recommendation: "Replace 'toolbar' with a valid ARIA role or remove the role attribute.",
  };

  const sampleCode = Array.from({ length: 200 }, (_, i) => `line ${i + 1}: const item_${i + 1} = true;`).join("\n");

  it("should assemble a rich structured prompt including rule explanation and local code window", async () => {
    const fetchRuleFn = vi.fn().mockResolvedValue(sampleRule);
    const readCodeSnippetFn = vi.fn().mockResolvedValue({
      snippet: "167: line 167\n168: ---> line 168\n169: line 169",
      startLine: 167,
      endLine: 169,
      language: "vue",
    });

    const dispatcher = new AgentDispatcher({
      fetchRuleFn,
      readCodeSnippetFn,
    });

    const prompt = await dispatcher.assemblePrompt(sampleItem);

    expect(prompt).toContain("### 📍 Lokasi");
    expect(prompt).toContain("resources/survey/components/widgets/TugasCardGrid.vue");
    expect(prompt).toContain("Line: 168");
    expect(prompt).toContain('Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.');
    expect(prompt).toContain("vue:S123");
    expect(prompt).toContain("ARIA roles validity");
    expect(prompt).toContain("Elements with ARIA roles must use a valid, non-abstract ARIA role to ensure accessibility.");
    expect(prompt).toContain("168: ---> line 168");
    expect(prompt).toContain("### 🎯 Instruksi untuk Agent");
  });

  it("should cache rule documentation to avoid duplicate API requests", async () => {
    const fetchRuleFn = vi.fn().mockResolvedValue(sampleRule);
    const readCodeSnippetFn = vi.fn().mockResolvedValue({
      snippet: "code",
      startLine: 1,
      endLine: 10,
      language: "vue",
    });

    const dispatcher = new AgentDispatcher({
      fetchRuleFn,
      readCodeSnippetFn,
    });

    await dispatcher.assemblePrompt(sampleItem);
    await dispatcher.assemblePrompt(sampleItem);

    // fetchRuleFn should only be called once because of in-memory caching
    expect(fetchRuleFn).toHaveBeenCalledTimes(1);
  });
});
