import * as vscode from 'vscode';
import { SonarOverview, QualityGateStatus, SonarCodePeriod } from './SonarClient.js';

export interface SonarStatusBarUpdateParams {
  projectKey?: string;
  overview?: SonarOverview | null;
  qualityGate?: QualityGateStatus | null;
  isDemoMode?: boolean;
  codePeriod?: SonarCodePeriod;
}

export class SonarStatusBar implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(statusBarItem?: vscode.StatusBarItem) {
    this.statusBarItem =
      statusBarItem ?? vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'sonarAgent.overviewView.focus';
  }

  public update(params: SonarStatusBarUpdateParams): void {
    const { qualityGate, isDemoMode } = params;
    const isNewCode =
      params.codePeriod === 'new' ||
      params.overview?.period === 'new' ||
      qualityGate?.period === 'new';

    const gateStatus = qualityGate?.status;
    let icon = '$(shield)';
    let label = 'Connected';

    const prefix = isNewCode ? 'Sonar (New)' : 'Sonar';
    if (isDemoMode) {
      icon = '$(beaker)';
      if (gateStatus === 'OK') {
        label = 'Demo (Passed)';
      } else if (gateStatus === 'ERROR') {
        label = 'Demo (Failed)';
      } else if (gateStatus === 'WARN') {
        label = 'Demo (Warning)';
      } else {
        label = 'Demo';
      }
    } else {
      if (gateStatus === 'OK') {
        icon = '$(pass)';
        label = 'Passed';
      } else if (gateStatus === 'ERROR') {
        icon = '$(error)';
        label = 'Failed';
      } else if (gateStatus === 'WARN') {
        icon = '$(warning)';
        label = 'Warning';
      }
    }

    this.statusBarItem.text = `${icon} ${prefix}: ${label}`;

    this.statusBarItem.tooltip = this.buildTooltip(params);
    this.statusBarItem.show();
  }

  public clear(): void {
    this.statusBarItem.hide();
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }

  private buildTooltip(params: SonarStatusBarUpdateParams): vscode.MarkdownString {
    const { projectKey, overview, qualityGate, isDemoMode } = params;
    const isNewCode =
      params.codePeriod === 'new' ||
      params.overview?.period === 'new' ||
      qualityGate?.period === 'new';

    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportThemeIcons = true;

    const gateStatus = qualityGate?.status;
    let gateLabel = 'Not Evaluated';
    let gateIcon = '⚪';
    if (gateStatus === 'OK') {
      gateLabel = 'Passed';
      gateIcon = '🟢';
    } else if (gateStatus === 'ERROR') {
      gateLabel = 'Failed';
      gateIcon = '🔴';
    } else if (gateStatus === 'WARN') {
      gateLabel = 'Warning';
      gateIcon = '🟡';
    }

    const periodLabel = isNewCode ? ' (New Code)' : '';

    if (isDemoMode) {
      md.appendMarkdown(`### 🧪 Sonar Agent (Demo Mode${periodLabel})\n\n`);
      md.appendMarkdown(
        `**Project:** \`${projectKey || 'demo-sample-project'}\` *(Sample Data)*\n\n`,
      );
    } else {
      md.appendMarkdown(`### 🛡️ Sonar Agent: Quality Gate ${gateLabel}${periodLabel}\n\n`);
      if (projectKey) {
        md.appendMarkdown(`**Project:** \`${projectKey}\`\n\n`);
      }
    }

    md.appendMarkdown(`**Quality Gate: ${gateLabel}** (${gateIcon})\n\n`);

    if (qualityGate?.conditions && qualityGate.conditions.length > 0) {
      md.appendMarkdown(`#### Quality Gate Conditions (${isNewCode ? 'New Code' : 'Overall'})\n\n`);
      md.appendMarkdown(`| Status | Metric | Value | Threshold |\n`);
      md.appendMarkdown(`| :--- | :--- | :--- | :--- |\n`);
      for (const cond of qualityGate.conditions) {
        let condIcon = '🟢';
        if (cond.status === 'ERROR') condIcon = '🔴';
        else if (cond.status === 'WARN') condIcon = '🟡';
        const threshold = cond.errorThreshold
          ? `${cond.comparator} ${cond.errorThreshold}`
          : cond.warnThreshold
            ? `${cond.comparator} ${cond.warnThreshold}`
            : '-';
        md.appendMarkdown(
          `| ${condIcon} | \`${cond.metricKey}\` | ${cond.actualValue ?? '-'} | ${threshold} |\n`,
        );
      }
      md.appendMarkdown(`\n`);
    }

    md.appendMarkdown(`---\n\n`);

    if (overview) {
      md.appendMarkdown(`| Metric | Value | Rating |\n`);
      md.appendMarkdown(`| :--- | :--- | :--- |\n`);
      md.appendMarkdown(
        `| **Bugs** | ${overview.reliability.count} | ${overview.reliability.rating} |\n`,
      );
      md.appendMarkdown(
        `| **Vulnerabilities** | ${overview.security.count} | ${overview.security.rating} |\n`,
      );
      md.appendMarkdown(
        `| **Security Hotspots** | ${overview.securityHotspots.count} | ${overview.securityHotspots.rating} |\n`,
      );
      md.appendMarkdown(
        `| **Code Smells** | ${overview.maintainability.count} | ${overview.maintainability.rating} |\n`,
      );
      md.appendMarkdown(`| **Coverage** | ${overview.coverage.percentage.toFixed(1)}% | - |\n`);
      md.appendMarkdown(
        `| **Duplications** | ${overview.duplications.percentage.toFixed(1)}% | - |\n\n`,
      );
    }

    md.appendMarkdown(`*Click to open Sonar Overview sidebar*`);
    return md;
  }
}
