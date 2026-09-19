import { describe, it, expect } from 'vitest';
import { filterSonarItems, isTestFile } from '../src/modules/ItemFilter.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';

describe('ItemFilter module', () => {
  const sampleItems: SonarDetailItem[] = [
    {
      id: 'issue-1',
      ruleKey: 'typescript:S123',
      message: 'Fix blocker bug',
      component: 'my-proj:src/services/auth.ts',
      filePath: 'src/services/auth.ts',
      line: 10,
      type: 'BUG',
      severity: 'BLOCKER',
      status: 'OPEN',
      tags: ['security'],
      creationDate: '2026-01-01',
      author: 'alice',
    },
    {
      id: 'issue-2',
      ruleKey: 'typescript:S456',
      message: 'Code smell in helper',
      component: 'my-proj:src/utils/helpers.ts',
      filePath: 'src/utils/helpers.ts',
      line: 25,
      type: 'CODE_SMELL',
      severity: 'MAJOR',
      status: 'OPEN',
      tags: [],
      creationDate: '2026-01-02',
      author: 'bob',
    },
    {
      id: 'issue-3',
      ruleKey: 'typescript:S789',
      message: 'Minor issue in test file',
      component: 'my-proj:tests/auth.test.ts',
      filePath: 'tests/auth.test.ts',
      line: 5,
      type: 'CODE_SMELL',
      severity: 'MINOR',
      status: 'OPEN',
      tags: ['test'],
      creationDate: '2026-01-03',
      author: 'alice',
    },
    {
      id: 'issue-4',
      ruleKey: 'typescript:S123',
      message: 'Major issue in spec file',
      component: 'my-proj:src/utils/helpers.spec.js',
      filePath: 'src/utils/helpers.spec.js',
      line: 14,
      type: 'BUG',
      severity: 'MAJOR',
      status: 'OPEN',
      tags: [],
      creationDate: '2026-01-04',
      author: 'charlie',
    },
    {
      id: 'issue-5',
      ruleKey: 'typescript:S999',
      message: 'Critical vulnerability',
      component: 'my-proj:src/api/handler.ts',
      filePath: 'src/api/handler.ts',
      line: 88,
      type: 'VULNERABILITY',
      severity: 'CRITICAL',
      status: 'OPEN',
      tags: ['cwe'],
      creationDate: '2026-01-05',
      author: 'bob',
    },
  ];

  describe('isTestFile', () => {
    it('should identify test files by directory', () => {
      expect(isTestFile('tests/unit/login.ts')).toBe(true);
      expect(isTestFile('src/__tests__/auth.ts')).toBe(true);
      expect(isTestFile('test/integration/db.go')).toBe(true);
      expect(isTestFile('src/spec/client.ts')).toBe(true);
    });

    it('should identify test files by filename pattern', () => {
      expect(isTestFile('src/app.test.tsx')).toBe(true);
      expect(isTestFile('src/app.spec.js')).toBe(true);
      expect(isTestFile('src/service_test.go')).toBe(true);
      expect(isTestFile('src/UserServiceTest.java')).toBe(true);
    });

    it('should return false for regular source files', () => {
      expect(isTestFile('src/services/auth.ts')).toBe(false);
      expect(isTestFile('src/components/TestimonyCard.vue')).toBe(false);
      expect(isTestFile('src/pages/contest.ts')).toBe(false);
      expect(isTestFile(undefined)).toBe(false);
    });
  });

  describe('filterSonarItems', () => {
    it('should return all items when default options are used', () => {
      const result = filterSonarItems(sampleItems);
      expect(result).toHaveLength(5);
    });

    it('should filter by Severity', () => {
      const blockers = filterSonarItems(sampleItems, { severity: 'BLOCKER' });
      expect(blockers).toHaveLength(1);
      expect(blockers[0].id).toBe('issue-1');

      const majors = filterSonarItems(sampleItems, { severity: 'MAJOR' });
      expect(majors).toHaveLength(2);
      expect(majors.map((i) => i.id)).toEqual(['issue-2', 'issue-4']);
    });

    it('should filter by Author', () => {
      const aliceItems = filterSonarItems(sampleItems, { author: 'alice' });
      expect(aliceItems).toHaveLength(2);
      expect(aliceItems.map((i) => i.id)).toEqual(['issue-1', 'issue-3']);

      const bobItems = filterSonarItems(sampleItems, { author: 'bob' });
      expect(bobItems).toHaveLength(2);
      expect(bobItems.map((i) => i.id)).toEqual(['issue-2', 'issue-5']);
    });

    it('should filter by File Path', () => {
      const authItems = filterSonarItems(sampleItems, { filePath: 'src/services/auth.ts' });
      expect(authItems).toHaveLength(1);
      expect(authItems[0].id).toBe('issue-1');
    });

    it('should filter by Rule Key', () => {
      const s123Items = filterSonarItems(sampleItems, { ruleKey: 'typescript:S123' });
      expect(s123Items).toHaveLength(2);
      expect(s123Items.map((i) => i.id)).toEqual(['issue-1', 'issue-4']);
    });

    it('should exclude test files when includeTestFiles is false', () => {
      const withoutTests = filterSonarItems(sampleItems, { includeTestFiles: false });
      expect(withoutTests).toHaveLength(3);
      expect(withoutTests.map((i) => i.id)).toEqual(['issue-1', 'issue-2', 'issue-5']);
    });

    it('should apply combined filters simultaneously', () => {
      // Major issues by author charlie
      const charlieMajor = filterSonarItems(sampleItems, {
        severity: 'MAJOR',
        author: 'charlie',
      });
      expect(charlieMajor).toHaveLength(1);
      expect(charlieMajor[0].id).toBe('issue-4');

      // Major issues by author charlie excluding tests (issue-4 is a test file)
      const charlieNoTests = filterSonarItems(sampleItems, {
        severity: 'MAJOR',
        author: 'charlie',
        includeTestFiles: false,
      });
      expect(charlieNoTests).toHaveLength(0);

      // Rule S123 excluding test files
      const s123NoTests = filterSonarItems(sampleItems, {
        ruleKey: 'typescript:S123',
        includeTestFiles: false,
      });
      expect(s123NoTests).toHaveLength(1);
      expect(s123NoTests[0].id).toBe('issue-1');
    });
  });
});
