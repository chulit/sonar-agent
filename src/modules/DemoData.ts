import {
  SonarOverview,
  SonarCodePeriod,
  QualityGateStatus,
  SonarDetailItem,
  SonarRuleDoc,
} from './SonarClient.js';

export interface DemoProject {
  key: string;
  name: string;
}

export class DemoData {
  static getProjects(): DemoProject[] {
    return [
      {
        key: 'demo-sample-project',
        name: 'Demo: Express & React Microservice',
      },
    ];
  }

  static getOverview(period: SonarCodePeriod = 'overall'): SonarOverview {
    if (period === 'new') {
      return {
        security: { count: 1, rating: 'B' },
        reliability: { count: 2, rating: 'B' },
        maintainability: { count: 4, rating: 'A' },
        acceptedIssues: { count: 0 },
        coverage: { percentage: 78.5, linesToCover: 140 },
        duplications: { percentage: 0.0, duplicatedLines: 0 },
        securityHotspots: { count: 1, rating: 'A' },
        period: 'new',
        hasNewCode: true,
      };
    }
    return {
      security: { count: 3, rating: 'D' },
      reliability: { count: 5, rating: 'C' },
      maintainability: { count: 18, rating: 'B' },
      acceptedIssues: { count: 2 },
      coverage: { percentage: 64.2, linesToCover: 850 },
      duplications: { percentage: 8.4, duplicatedLines: 120 },
      securityHotspots: { count: 4, rating: 'E' },
      period: 'overall',
      hasNewCode: true,
    };
  }

  static getQualityGate(period: SonarCodePeriod = 'overall'): QualityGateStatus {
    if (period === 'new') {
      return {
        status: 'ERROR',
        period: 'new',
        conditions: [
          {
            status: 'ERROR',
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '80.0',
            actualValue: '78.5',
          },
          {
            status: 'OK',
            metricKey: 'new_reliability_rating',
            comparator: 'GT',
            errorThreshold: '1',
            actualValue: '1',
          },
          {
            status: 'OK',
            metricKey: 'new_security_rating',
            comparator: 'GT',
            errorThreshold: '1',
            actualValue: '1',
          },
          {
            status: 'OK',
            metricKey: 'new_duplicated_lines_density',
            comparator: 'GT',
            errorThreshold: '3.0',
            actualValue: '0.0',
          },
        ],
      };
    }
    return {
      status: 'ERROR',
      period: 'overall',
      conditions: [
        {
          status: 'ERROR',
          metricKey: 'coverage',
          comparator: 'LT',
          errorThreshold: '80.0',
          actualValue: '64.2',
        },
        {
          status: 'ERROR',
          metricKey: 'reliability_rating',
          comparator: 'GT',
          errorThreshold: '1',
          actualValue: '3',
        },
        {
          status: 'ERROR',
          metricKey: 'security_rating',
          comparator: 'GT',
          errorThreshold: '1',
          actualValue: '4',
        },
        {
          status: 'OK',
          metricKey: 'duplicated_lines_density',
          comparator: 'GT',
          errorThreshold: '10.0',
          actualValue: '8.4',
        },
      ],
    };
  }

  static getDetails(category?: string, period: SonarCodePeriod = 'overall'): SonarDetailItem[] {
    const items: SonarDetailItem[] = [
      // Bugs (Reliability)
      {
        id: 'demo-rel-1',
        ruleKey: 'typescript:S2259',
        message: 'Null pointer dereference possible: `user.profile` may be undefined before access',
        component: 'src/services/UserService.ts',
        filePath: 'src/services/UserService.ts',
        line: 42,
        type: 'BUG',
        severity: 'CRITICAL',
        status: 'OPEN',
        effort: '15min',
        tags: ['bug', 'null-safety'],
        creationDate: '2026-10-09T08:30:00Z',
        author: 'developer@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-rel-2',
        ruleKey: 'javascript:S3796',
        message: 'Functions called in array methods like `filter` or `map` should return a value',
        component: 'src/controllers/OrderController.ts',
        filePath: 'src/controllers/OrderController.ts',
        line: 88,
        type: 'BUG',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '10min',
        tags: ['bug', 'es6'],
        creationDate: '2026-10-08T14:15:00Z',
        author: 'developer@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-rel-3',
        ruleKey: 'typescript:S4144',
        message:
          'Duplicate implementation in `handlePaymentCallback` — logic matches `verifyPayment`',
        component: 'src/services/PaymentService.ts',
        filePath: 'src/services/PaymentService.ts',
        line: 114,
        type: 'BUG',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '20min',
        tags: ['bug', 'redundant'],
        creationDate: '2026-10-07T11:00:00Z',
        author: 'lead@example.com',
        inNewCodePeriod: false,
      },

      // Vulnerabilities (Security)
      {
        id: 'demo-sec-1',
        ruleKey: 'javascript:S2068',
        message:
          'Hard-coded credentials detected: `jwt_secret_fallback` should not be stored in source code',
        component: 'src/config/authConfig.ts',
        filePath: 'src/config/authConfig.ts',
        line: 15,
        type: 'VULNERABILITY',
        severity: 'BLOCKER',
        status: 'OPEN',
        effort: '30min',
        tags: ['security', 'cwe-798', 'owasp-a2'],
        creationDate: '2026-10-09T09:12:00Z',
        author: 'security@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-sec-2',
        ruleKey: 'typescript:S5147',
        message:
          'Potential NoSQL Injection: unvalidated query parameter directly bound to database query filter',
        component: 'src/repositories/ProductRepository.ts',
        filePath: 'src/repositories/ProductRepository.ts',
        line: 67,
        type: 'VULNERABILITY',
        severity: 'CRITICAL',
        status: 'OPEN',
        effort: '45min',
        tags: ['security', 'injection', 'cwe-89'],
        creationDate: '2026-10-08T16:20:00Z',
        author: 'backend@example.com',
        inNewCodePeriod: false,
      },

      // Code Smells (Maintainability)
      {
        id: 'demo-maint-1',
        ruleKey: 'typescript:S3776',
        message:
          'Cognitive Complexity of function `processTransaction` is 18 (exceeds authorized threshold of 15)',
        component: 'src/services/TransactionManager.ts',
        filePath: 'src/services/TransactionManager.ts',
        line: 52,
        type: 'CODE_SMELL',
        severity: 'CRITICAL',
        status: 'OPEN',
        effort: '40min',
        tags: ['brain-overload', 'complexity'],
        creationDate: '2026-10-06T12:00:00Z',
        author: 'contributor@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-maint-2',
        ruleKey: 'typescript:S107',
        message:
          'Method `createUserProfile` has 6 parameters, which is greater than the 4 authorized',
        component: 'src/services/UserService.ts',
        filePath: 'src/services/UserService.ts',
        line: 130,
        type: 'CODE_SMELL',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '15min',
        tags: ['design', 'parameters'],
        creationDate: '2026-10-07T10:05:00Z',
        author: 'contributor@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-maint-3',
        ruleKey: 'javascript:S1854',
        message: 'Remove this useless assignment to variable `tempSessionId`',
        component: 'src/middleware/sessionMiddleware.ts',
        filePath: 'src/middleware/sessionMiddleware.ts',
        line: 28,
        type: 'CODE_SMELL',
        severity: 'MINOR',
        status: 'OPEN',
        effort: '5min',
        tags: ['unused'],
        creationDate: '2026-10-09T14:40:00Z',
        author: 'intern@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-maint-4',
        ruleKey: 'javascript:S1481',
        message: 'Remove this unused local variable `cachedAuthToken`',
        component: 'src/config/authConfig.ts',
        filePath: 'src/config/authConfig.ts',
        line: 42,
        type: 'CODE_SMELL',
        severity: 'MINOR',
        status: 'OPEN',
        effort: '5min',
        tags: ['unused', 'clean-code'],
        creationDate: '2026-10-09T15:00:00Z',
        author: 'developer@example.com',
        inNewCodePeriod: true,
      },

      // Security Hotspots
      {
        id: 'demo-hotspot-1',
        ruleKey: 'javascript:S4790',
        message: 'Make sure that using MD5 hashing algorithm is safe here',
        component: 'src/utils/hashHelper.ts',
        filePath: 'src/utils/hashHelper.ts',
        line: 12,
        type: 'HOTSPOT',
        severity: 'CRITICAL',
        status: 'TO_REVIEW',
        tags: ['cryptography', 'owasp-a3'],
        creationDate: '2026-10-05T09:00:00Z',
        author: 'developer@example.com',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-hotspot-2',
        ruleKey: 'javascript:S5122',
        message: 'Review CORS configuration: Access-Control-Allow-Origin is set to wildcard `*`',
        component: 'src/server.ts',
        filePath: 'src/server.ts',
        line: 34,
        type: 'HOTSPOT',
        severity: 'MAJOR',
        status: 'TO_REVIEW',
        tags: ['cors', 'security'],
        creationDate: '2026-10-04T15:30:00Z',
        author: 'lead@example.com',
        inNewCodePeriod: false,
      },

      // Coverage
      {
        id: 'demo-cov-1',
        ruleKey: 'coverage:uncovered_lines',
        message: '34 uncovered lines (42% coverage)',
        component: 'src/services/PaymentProcessor.ts',
        filePath: 'src/services/PaymentProcessor.ts',
        line: 1,
        type: 'COVERAGE',
        severity: 'CRITICAL',
        status: 'OPEN',
        effort: '1h',
        tags: ['test-coverage', 'unit-test'],
        creationDate: '2026-10-09T00:00:00Z',
        inNewCodePeriod: true,
      },
      {
        id: 'demo-cov-2',
        ruleKey: 'coverage:uncovered_lines',
        message: '18 uncovered lines (55% coverage)',
        component: 'src/utils/DateFormatter.ts',
        filePath: 'src/utils/DateFormatter.ts',
        line: 1,
        type: 'COVERAGE',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '30min',
        tags: ['test-coverage', 'unit-test'],
        creationDate: '2026-10-09T00:00:00Z',
        inNewCodePeriod: false,
      },

      // Duplications
      {
        id: 'demo-dup-1',
        ruleKey: 'duplications:duplicated_blocks',
        message: '45 duplicated lines across 2 blocks',
        component: 'src/controllers/UserController.ts',
        filePath: 'src/controllers/UserController.ts',
        line: 60,
        type: 'DUPLICATION',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '25min',
        tags: ['duplication', 'refactor'],
        creationDate: '2026-10-08T00:00:00Z',
        inNewCodePeriod: false,
      },
      {
        id: 'demo-dup-2',
        ruleKey: 'duplications:duplicated_blocks',
        message: '45 duplicated lines across 2 blocks',
        component: 'src/controllers/AdminController.ts',
        filePath: 'src/controllers/AdminController.ts',
        line: 72,
        type: 'DUPLICATION',
        severity: 'MAJOR',
        status: 'OPEN',
        effort: '25min',
        tags: ['duplication', 'refactor'],
        creationDate: '2026-10-08T00:00:00Z',
        inNewCodePeriod: false,
      },
    ];

    const scopedItems = period === 'new' ? items.filter((i) => i.inNewCodePeriod === true) : items;

    if (!category || category === 'all') {
      return scopedItems;
    }

    switch (category) {
      case 'reliability':
        return scopedItems.filter((i) => i.type === 'BUG');
      case 'security':
        return scopedItems.filter((i) => i.type === 'VULNERABILITY');
      case 'maintainability':
        return scopedItems.filter((i) => i.type === 'CODE_SMELL');
      case 'hotspots':
        return scopedItems.filter((i) => i.type === 'HOTSPOT');
      case 'coverage':
        return scopedItems.filter((i) => i.type === 'COVERAGE');
      case 'duplications':
        return scopedItems.filter((i) => i.type === 'DUPLICATION');
      default:
        return scopedItems;
    }
  }

  static getRuleDoc(ruleKey: string): SonarRuleDoc | undefined {
    const docs: Record<string, SonarRuleDoc> = {
      'typescript:S3776': {
        key: 'typescript:S3776',
        name: 'Cognitive Complexity of functions should not be too high',
        cleanDesc:
          'Cognitive Complexity is a measure of how difficult the control flow of a function is to understand. Functions with high Cognitive Complexity are harder to test, maintain, and reason about.',
        recommendation:
          'Refactor the function by breaking nested control structures, extracting helper functions, or using early return patterns to flatten indentation.',
      },
      'javascript:S2068': {
        key: 'javascript:S2068',
        name: 'Hard-coded credentials should not be used',
        cleanDesc:
          'Hard-coded credentials like secrets, passwords, and tokens stored directly in source code expose systems to credential theft and unauthorized access.',
        recommendation:
          'Store credentials in environment variables or a secret management service (e.g. AWS Secrets Manager, HashiCorp Vault), and retrieve them at runtime.',
      },
      'typescript:S2259': {
        key: 'typescript:S2259',
        name: 'Null pointers should not be dereferenced',
        cleanDesc:
          'Accessing properties or methods on a reference that can be null or undefined leads to unexpected runtime TypeError exceptions.',
        recommendation:
          'Use optional chaining (`?.`), nullish coalescing (`??`), or explicit guard checks before accessing nested properties.',
      },
      'javascript:S3796': {
        key: 'javascript:S3796',
        name: 'Array callbacks should return a value',
        cleanDesc:
          'Array methods such as `map`, `filter`, and `reduce` expect the callback to return a value on each iteration. Omitting a return statement often indicates a logic bug.',
        recommendation:
          'Ensure the callback explicitly returns a value, or switch to `forEach` if you only require side effects.',
      },
      'typescript:S107': {
        key: 'typescript:S107',
        name: 'Functions should not have too many parameters',
        cleanDesc:
          'Functions with a long parameter list become confusing to call and violate the single responsibility principle.',
        recommendation: 'Group related parameters into a single configuration object or interface.',
      },
      'javascript:S4790': {
        key: 'javascript:S4790',
        name: 'Make sure that hashing data is safe here',
        cleanDesc:
          'Weak hash algorithms like MD5 or SHA-1 are cryptographically broken and vulnerable to collision attacks.',
        recommendation:
          'Use modern secure algorithms like SHA-256 for integrity verification, or salted slow hashes (bcrypt, argon2) for password storage.',
      },
    };

    return docs[ruleKey];
  }
}
