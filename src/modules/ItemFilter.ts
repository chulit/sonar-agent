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
  const segments = normalized.toLowerCase().split('/');
  const rawFilename = normalized.split('/').pop() || '';
  const lowerFilename = rawFilename.toLowerCase();

  // Check directory segments
  if (
    segments.some(
      (seg) =>
        seg === 'test' ||
        seg === 'tests' ||
        seg === '__tests__' ||
        seg === '__test__' ||
        seg === 'testing' ||
        seg === 'spec' ||
        seg === 'specs',
    )
  ) {
    return true;
  }

  // Check filename patterns like foo.test.ts, foo.spec.js, foo_test.go
  if (
    lowerFilename.includes('.test.') ||
    lowerFilename.includes('.spec.') ||
    lowerFilename.includes('_test.') ||
    lowerFilename.includes('-test.') ||
    lowerFilename.includes('_spec.') ||
    lowerFilename.includes('-spec.')
  ) {
    return true;
  }

  // Exact name or separator suffix: test.ts, auth.test.ts, auth_test.go
  if (/^(?:test|tests|spec|specs)\.[a-z0-9]+$/i.test(rawFilename)) {
    return true;
  }
  if (/[._-](?:test|tests|spec|specs)\.[a-z0-9]+$/i.test(rawFilename)) {
    return true;
  }

  // CamelCase suffix: UserServiceTest.java, AuthSpec.groovy, but NOT contest.ts
  if (/[a-zA-Z0-9](?:Test|Tests|Spec|Specs)\.[a-z0-9]+$/.test(rawFilename)) {
    return true;
  }

  return false;
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
