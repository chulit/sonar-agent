import * as vscode from 'vscode';
import {
  SonarOverview,
  QualityGateStatus,
  SonarCodePeriod,
  QualityGateCondition,
} from './SonarClient.js';

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

  private getStatusDisplay(
    gateStatus: string | undefined,
    isDemoMode: boolean,
  ): { icon: string; label: string } {
    if (isDemoMode) {
      switch (gateStatus) {
        case 'OK':
          return { icon: '$(beaker)', label: 'Demo (Passed)' };
        case 'ERROR':
          return { icon: '$(beaker)', label: 'Demo (Failed)' };
        case 'WARN':
          return { icon: '$(beaker)', label: 'Demo (Warning)' };
        default:
          return { icon: '$(beaker)', label: 'Demo' };
      }
    }

    switch (gateStatus) {
      case 'OK':
        return { icon: '$(pass)', label: 'Passed' };
      case 'ERROR':
        return { icon: '$(error)', label: 'Failed' };
      case 'WARN':
        return { icon: '$(warning)', label: 'Warning' };
      default:
        return { icon: '$(shield)', label: 'Connected' };
    }
  }

  public update(params: SonarStatusBarUpdateParams): void {
    const { qualityGate, isDemoMode } = params;
    const isNewCode =
      params.codePeriod === 'new' ||
      params.overview?.period === 'new' ||
      qualityGate?.period === 'new';

    const { icon, label } = this.getStatusDisplay(qualityGate?.status, !!isDemoMode);
    const prefix = isNewCode ? 'Sonar (New)' : 'Sonar';

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

  private getGatePresentation(gateStatus: string | undefined): { label: string; icon: string } {
    switch (gateStatus) {
      case 'OK':
        return { label: 'Passed', icon: '🟢' };
      case 'ERROR':
        return { label: 'Failed', icon: '🔴' };
      case 'WARN':
        return { label: 'Warning', icon: '🟡' };
      default:
        return { label: 'Not Evaluated', icon: '⚪' };
    }
  }

  private formatConditionThreshold(cond: QualityGateCondition): string {
    if (cond.errorThreshold) {
      return `${cond.comparator} ${cond.errorThreshold}`;
    }
    if (cond.warnThreshold) {
      return `${cond.comparator} ${cond.warnThreshold}`;
    }
    return '-';
  }

  private getConditionIcon(status: string): string {
    if (status === 'ERROR') {
      return '🔴';
    }
    if (status === 'WARN') {
      return '🟡';
    }
    return '🟢';
  }

  private appendTooltipHeader(
    md: vscode.MarkdownString,
    projectKey: string | undefined,
    isDemoMode: boolean,
    periodLabel: string,
    gateLabel: string,
    gateIcon: string,
  ): void {
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
  }

  private appendConditionsTable(
    md: vscode.MarkdownString,
    conditions: QualityGateCondition[],
    isNewCode: boolean,
  ): void {
    md.appendMarkdown(`#### Quality Gate Conditions (${isNewCode ? 'New Code' : 'Overall'})\n\n`);
    md.appendMarkdown(`| Status | Metric | Value | Threshold |\n`);
    md.appendMarkdown(`| :--- | :--- | :--- | :--- |\n`);
    for (const cond of conditions) {
      const condIcon = this.getConditionIcon(cond.status);
      const threshold = this.formatConditionThreshold(cond);
      md.appendMarkdown(
        `| ${condIcon} | \`${cond.metricKey}\` | ${cond.actualValue ?? '-'} | ${threshold} |\n`,
      );
    }
    md.appendMarkdown(`\n`);
  }

  private appendOverviewTable(md: vscode.MarkdownString, overview: SonarOverview): void {
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

  private buildTooltip(params: SonarStatusBarUpdateParams): vscode.MarkdownString {
    const { projectKey, overview, qualityGate, isDemoMode } = params;
    const isNewCode =
      params.codePeriod === 'new' ||
      params.overview?.period === 'new' ||
      qualityGate?.period === 'new';

    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportThemeIcons = true;

    const { label: gateLabel, icon: gateIcon } = this.getGatePresentation(qualityGate?.status);
    const periodLabel = isNewCode ? ' (New Code)' : '';

    this.appendTooltipHeader(md, projectKey, !!isDemoMode, periodLabel, gateLabel, gateIcon);

    if (qualityGate?.conditions && qualityGate.conditions.length > 0) {
      this.appendConditionsTable(md, qualityGate.conditions, isNewCode);
    } else if (overview) {
      this.appendOverviewTable(md, overview);
    }

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`*Click to open Sonar Overview sidebar*`);
    return md;
  }
}
