import { describe, it, expect } from 'vitest';
import { DemoData } from '../src/modules/DemoData.js';

describe('DemoData', () => {
  it('returns demo projects list with at least one project', () => {
    const projects = DemoData.getProjects();
    expect(projects).toBeDefined();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].key).toBe('demo-sample-project');
  });

  it('returns valid SonarOverview with failing-grade ratings and non-zero counts', () => {
    const overview = DemoData.getOverview();
    expect(overview).toBeDefined();
    expect(overview.reliability.count).toBeGreaterThan(0);
    expect(overview.security.count).toBeGreaterThan(0);
    expect(overview.maintainability.count).toBeGreaterThan(0);
    expect(overview.coverage.percentage).toBeLessThan(80);
    expect(overview.duplications.percentage).toBeGreaterThan(3);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(overview.reliability.rating);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(overview.security.rating);
  });

  it('returns failing QualityGateStatus with failed conditions', () => {
    const gate = DemoData.getQualityGate();
    expect(gate).toBeDefined();
    expect(gate.status).toBe('ERROR');
    expect(gate.conditions.length).toBeGreaterThan(0);
    const errorCondition = gate.conditions.find((c) => c.status === 'ERROR');
    expect(errorCondition).toBeDefined();
  });

  it('returns sample detail items across all issue categories', () => {
    const all = DemoData.getDetails();
    expect(all.length).toBeGreaterThan(5);

    const reliability = DemoData.getDetails('reliability');
    expect(reliability.length).toBeGreaterThan(0);
    expect(reliability.every((i) => i.type === 'BUG')).toBe(true);

    const security = DemoData.getDetails('security');
    expect(security.length).toBeGreaterThan(0);
    expect(security.every((i) => i.type === 'VULNERABILITY')).toBe(true);

    const maintainability = DemoData.getDetails('maintainability');
    expect(maintainability.length).toBeGreaterThan(0);
    expect(maintainability.every((i) => i.type === 'CODE_SMELL')).toBe(true);

    const hotspots = DemoData.getDetails('hotspots');
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots.every((i) => i.type === 'HOTSPOT')).toBe(true);

    const coverage = DemoData.getDetails('coverage');
    expect(coverage.length).toBeGreaterThan(0);
    expect(coverage.every((i) => i.type === 'COVERAGE')).toBe(true);

    const duplications = DemoData.getDetails('duplications');
    expect(duplications.length).toBeGreaterThan(0);
    expect(duplications.every((i) => i.type === 'DUPLICATION')).toBe(true);
  });

  it('provides rich SonarRuleDoc for demo rule keys', () => {
    const doc = DemoData.getRuleDoc('typescript:S3776');
    expect(doc).toBeDefined();
    expect(doc?.key).toBe('typescript:S3776');
    expect(doc?.cleanDesc).toContain('Cognitive Complexity');

    const credDoc = DemoData.getRuleDoc('javascript:S2068');
    expect(credDoc).toBeDefined();
    expect(credDoc?.cleanDesc).toContain('Hard-coded credentials');
  });
});
