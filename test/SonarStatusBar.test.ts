import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarStatusBar } from '../src/modules/SonarStatusBar.js';
import { SonarOverview, QualityGateStatus } from '../src/modules/SonarClient.js';

describe('SonarStatusBar', () => {
  let mockItem: any;
  let statusBar: SonarStatusBar;

  const sampleOverview: SonarOverview = {
    security: { count: 2, rating: 'B' },
    reliability: { count: 3, rating: 'C' },
    maintainability: { count: 12, rating: 'A' },
    acceptedIssues: { count: 0 },
    coverage: { percentage: 82.5, linesToCover: 500 },
    duplications: { percentage: 2.1, duplicatedLines: 40 },
    securityHotspots: { count: 1, rating: 'D' },
  };

  const samplePassingGate: QualityGateStatus = {
    status: 'OK',
    conditions: [
      {
        metricKey: 'new_coverage',
        status: 'OK',
        comparator: 'LT',
        actualValue: '85.0',
        errorThreshold: '80.0',
      },
    ],
  };

  const sampleFailingGate: QualityGateStatus = {
    status: 'ERROR',
    conditions: [
      {
        metricKey: 'new_coverage',
        status: 'ERROR',
        comparator: 'LT',
        actualValue: '64.2',
        errorThreshold: '80.0',
      },
    ],
  };

  beforeEach(() => {
    mockItem = {
      text: '',
      tooltip: undefined,
      command: '',
      color: undefined,
      backgroundColor: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    };
    statusBar = new SonarStatusBar(mockItem);
  });

  it('configures click command to focus the Sonar Overview sidebar', () => {
    expect(mockItem.command).toBe('sonarAgent.overviewView.focus');
  });

  it('displays passing state when Quality Gate is OK', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: sampleOverview,
      qualityGate: samplePassingGate,
    });

    expect(mockItem.text).toBe('$(pass) Sonar: Passed');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('displays failing state when Quality Gate has failed conditions', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: sampleOverview,
      qualityGate: sampleFailingGate,
    });

    expect(mockItem.text).toBe('$(error) Sonar: Failed');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('displays demo state when Demo Mode is active', () => {
    statusBar.update({
      projectKey: 'demo-sample-project',
      overview: sampleOverview,
      qualityGate: sampleFailingGate,
      isDemoMode: true,
    });

    expect(mockItem.text).toBe('$(beaker) Sonar: Demo (Failed)');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('generates rich Markdown tooltip with project key and metric breakdown', () => {
    statusBar.update({
      projectKey: 'my-org:awesome-service',
      overview: sampleOverview,
      qualityGate: sampleFailingGate,
    });

    expect(mockItem.tooltip).toBeDefined();
    const tooltipText = (mockItem.tooltip as vscode.MarkdownString).value;
    expect(tooltipText).toContain('my-org:awesome-service');
    expect(tooltipText).toContain('Quality Gate: Failed');
    expect(tooltipText).toContain('Bugs');
    expect(tooltipText).toContain('3');
    expect(tooltipText).toContain('Vulnerabilities');
    expect(tooltipText).toContain('2');
    expect(tooltipText).toContain('Coverage');
    expect(tooltipText).toContain('82.5%');
    expect(tooltipText).toContain('Duplications');
    expect(tooltipText).toContain('2.1%');
  });

  it('indicates Demo Mode in tooltip when demo is active', () => {
    statusBar.update({
      projectKey: 'demo-sample-project',
      overview: sampleOverview,
      qualityGate: sampleFailingGate,
      isDemoMode: true,
    });

    const tooltipText = (mockItem.tooltip as vscode.MarkdownString).value;
    expect(tooltipText).toContain('Demo Mode');
  });

  it('displays New Code passing state when codePeriod is new and gate is OK', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: { ...sampleOverview, period: 'new' },
      qualityGate: { ...samplePassingGate, period: 'new' },
      codePeriod: 'new',
    });

    expect(mockItem.text).toBe('$(pass) Sonar (New): Passed');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('displays New Code failing state when codePeriod is new and gate is ERROR', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: { ...sampleOverview, period: 'new' },
      qualityGate: { ...sampleFailingGate, period: 'new' },
      codePeriod: 'new',
    });

    expect(mockItem.text).toBe('$(error) Sonar (New): Failed');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('displays New Code demo state when demo is active in new code period', () => {
    statusBar.update({
      projectKey: 'demo-sample-project',
      overview: { ...sampleOverview, period: 'new' },
      qualityGate: { ...samplePassingGate, period: 'new' },
      isDemoMode: true,
      codePeriod: 'new',
    });

    expect(mockItem.text).toBe('$(beaker) Sonar (New): Demo (Passed)');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('renders conditions table in tooltip with actual values and thresholds', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: { ...sampleOverview, period: 'new' },
      qualityGate: {
        status: 'ERROR',
        period: 'new',
        conditions: [
          {
            metricKey: 'new_coverage',
            status: 'ERROR',
            comparator: 'LT',
            actualValue: '72.0',
            errorThreshold: '80.0',
          },
          {
            metricKey: 'new_duplicated_lines_density',
            status: 'OK',
            comparator: 'GT',
            actualValue: '1.2',
            errorThreshold: '3.0',
          },
        ],
      },
      codePeriod: 'new',
    });

    const tooltipText = (mockItem.tooltip as vscode.MarkdownString).value;
    expect(tooltipText).toContain('Quality Gate Conditions (New Code)');
    expect(tooltipText).toContain('`new_coverage`');
    expect(tooltipText).toContain('72.0');
    expect(tooltipText).toContain('LT 80.0');
    expect(tooltipText).toContain('`new_duplicated_lines_density`');
    expect(tooltipText).toContain('1.2');
  });

  it('hides the item on clear()', () => {
    statusBar.update({
      projectKey: 'my-project',
      overview: sampleOverview,
      qualityGate: samplePassingGate,
    });
    expect(mockItem.show).toHaveBeenCalled();

    statusBar.clear();
    expect(mockItem.hide).toHaveBeenCalled();
  });

  it('disposes underlying status bar item on dispose()', () => {
    statusBar.dispose();
    expect(mockItem.dispose).toHaveBeenCalled();
  });
});
