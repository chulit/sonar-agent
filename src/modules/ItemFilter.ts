import { SonarDetailItem } from './SonarClient.js';

export interface SonarItemFilterOptions {
  severity?: string;
  author?: string;
  filePath?: string;
  ruleKey?: string;
  includeTestFiles?: boolean;
}

/**
 * Checks if a given file path corresponds to a test file or test directory.
 */
export function isTestFile(filePath?: string): boolean {
  if (!filePath) {
    return false;
  }
  const normalized = filePath.replace(/\\/g, '/');

  // Check test directory segments (e.g. tests/, __tests__/, spec/)
  if (/(?:^|\/)(?:__tests?__|tests?|testing|specs?)(?:\/|$)/i.test(normalized)) {
    return true;
  }

  const filename = normalized.split('/').pop() || '';
  // Check test filenames (e.g. app.test.tsx, service_test.go, UserServiceTest.java; not contest.ts)
  return (
    /(?:^|[._-])(?:test|spec)s?(?:[._-]|\.[a-z0-9]+$)/i.test(filename) ||
    /[a-zA-Z0-9](?:Test|Spec)s?\.[a-z0-9]+$/.test(filename)
  );
}

/**
 * Filters SonarDetailItems based on Severity, Author, File, Rule, and Test File inclusion.
 */
export function filterSonarItems(
  items: SonarDetailItem[],
  options: SonarItemFilterOptions = {},
): SonarDetailItem[] {
  const {
    severity = 'ALL',
    author = 'ALL',
    filePath = 'ALL',
    ruleKey = 'ALL',
    includeTestFiles = true,
  } = options;

  return items.filter((item) => {
    if (severity !== 'ALL' && item.severity !== severity) {
      return false;
    }
    if (author !== 'ALL' && (item.author || '') !== author) {
      return false;
    }
    if (filePath !== 'ALL' && item.filePath !== filePath) {
      return false;
    }
    if (ruleKey !== 'ALL' && item.ruleKey !== ruleKey) {
      return false;
    }
    if (!includeTestFiles && isTestFile(item.filePath)) {
      return false;
    }
    return true;
  });
}
