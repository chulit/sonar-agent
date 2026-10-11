import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateCoverageRing,
  calculateDuplicationsRing,
  getRatingColor,
  shouldTriggerCelebration,
  CIRCUMFERENCE_R14,
} from '../src/modules/BentoHealthRings.js';

describe('BentoHealthRings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateCoverageRing', () => {
    it('calculates 100% full green ring', () => {
      const res = calculateCoverageRing(100);
      expect(res.dashArray).toBe(CIRCUMFERENCE_R14);
      expect(res.dashOffset).toBe(0);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates 85% high coverage green ring', () => {
      const res = calculateCoverageRing(85);
      expect(res.dashOffset).toBeCloseTo(13.19, 1);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates exactly 80% coverage threshold as green ring', () => {
      const res = calculateCoverageRing(80);
      expect(res.dashOffset).toBeCloseTo(17.59, 1);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates 79.9% coverage as yellow ring (just below 80)', () => {
      const res = calculateCoverageRing(79.9);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates 65% medium coverage yellow ring', () => {
      const res = calculateCoverageRing(65);
      expect(res.dashOffset).toBeCloseTo(30.79, 1);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates exactly 50% coverage threshold as yellow ring', () => {
      const res = calculateCoverageRing(50);
      expect(res.dashOffset).toBeCloseTo(43.98, 1);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates 49.9% coverage as red ring (just below 50)', () => {
      const res = calculateCoverageRing(49.9);
      expect(res.strokeColor).toBe('var(--sonar-red)');
    });

    it('calculates 30% low coverage red ring', () => {
      const res = calculateCoverageRing(30);
      expect(res.dashOffset).toBeCloseTo(61.57, 1);
      expect(res.strokeColor).toBe('var(--sonar-red)');
    });

    it('clamps negative or >100 percentages', () => {
      const zero = calculateCoverageRing(-10);
      expect(zero.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(zero.strokeColor).toBe('var(--sonar-red)');

      const over = calculateCoverageRing(150);
      expect(over.dashOffset).toBe(0);
      expect(over.strokeColor).toBe('var(--sonar-green)');
    });

    it('handles non-finite numbers (NaN, Infinity, -Infinity) falling back to 0', () => {
      const nanRes = calculateCoverageRing(Number.NaN);
      expect(nanRes.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(nanRes.strokeColor).toBe('var(--sonar-red)');

      const infRes = calculateCoverageRing(Number.POSITIVE_INFINITY);
      expect(infRes.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(infRes.strokeColor).toBe('var(--sonar-red)');

      const negInfRes = calculateCoverageRing(Number.NEGATIVE_INFINITY);
      expect(negInfRes.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(negInfRes.strokeColor).toBe('var(--sonar-red)');
    });

    it('uses Math.round to calculate dashOffset accurately (verified via vi.spyOn)', () => {
      const roundSpy = vi.spyOn(Math, 'round');
      const res = calculateCoverageRing(75);
      expect(roundSpy).toHaveBeenCalled();
      expect(res.dashOffset).toBeCloseTo(21.99, 1);
    });
  });

  describe('calculateDuplicationsRing', () => {
    it('calculates clean duplications (< 3%) with green ring', () => {
      const res = calculateDuplicationsRing(1.8);
      expect(res.dashArray).toBe(CIRCUMFERENCE_R14);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates exactly 3% duplications as green ring (boundary <= 3)', () => {
      const res = calculateDuplicationsRing(3);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates moderate duplications (3-10%) with yellow ring', () => {
      const res = calculateDuplicationsRing(5.2);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates exactly 10% duplications as yellow ring (boundary <= 10)', () => {
      const res = calculateDuplicationsRing(10);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates 10.1% duplications as red ring (just above 10)', () => {
      const res = calculateDuplicationsRing(10.1);
      expect(res.strokeColor).toBe('var(--sonar-red)');
    });

    it('calculates heavy duplications (> 10%) with red ring', () => {
      const res = calculateDuplicationsRing(14.5);
      expect(res.strokeColor).toBe('var(--sonar-red)');
    });

    it('clamps negative percentages to 0 and >100 percentages to 100', () => {
      const negative = calculateDuplicationsRing(-5);
      expect(negative.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(negative.strokeColor).toBe('var(--sonar-green)');

      const over = calculateDuplicationsRing(120);
      expect(over.dashOffset).toBe(0);
      expect(over.strokeColor).toBe('var(--sonar-red)');
    });

    it('handles non-finite numbers (NaN, Infinity) safely defaulting to 0', () => {
      const nanRes = calculateDuplicationsRing(Number.NaN);
      expect(nanRes.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(nanRes.strokeColor).toBe('var(--sonar-green)');

      const infRes = calculateDuplicationsRing(Number.POSITIVE_INFINITY);
      expect(infRes.dashOffset).toBe(CIRCUMFERENCE_R14);
      expect(infRes.strokeColor).toBe('var(--sonar-green)');
    });

    it('uses Math.max for clamping lower bound (verified via vi.spyOn)', () => {
      const maxSpy = vi.spyOn(Math, 'max');
      calculateDuplicationsRing(5);
      expect(maxSpy).toHaveBeenCalled();
    });
  });

  describe('getRatingColor', () => {
    it('maps letter ratings A through E to color variables', () => {
      expect(getRatingColor('A')).toBe('var(--sonar-green)');
      expect(getRatingColor('B')).toBe('var(--sonar-lime)');
      expect(getRatingColor('C')).toBe('var(--sonar-yellow)');
      expect(getRatingColor('D')).toBe('var(--sonar-orange)');
      expect(getRatingColor('E')).toBe('var(--sonar-red)');
    });

    it('handles lowercase and whitespace in rating letters', () => {
      expect(getRatingColor('  a  ')).toBe('var(--sonar-green)');
      expect(getRatingColor('b')).toBe('var(--sonar-lime)');
      expect(getRatingColor(' c ')).toBe('var(--sonar-yellow)');
      expect(getRatingColor('d')).toBe('var(--sonar-orange)');
      expect(getRatingColor('e')).toBe('var(--sonar-red)');
    });

    it('maps numeric string and number ratings to color variables', () => {
      expect(getRatingColor('1')).toBe('var(--sonar-green)');
      expect(getRatingColor('1.0')).toBe('var(--sonar-green)');
      expect(getRatingColor(1)).toBe('var(--sonar-green)');

      expect(getRatingColor('2')).toBe('var(--sonar-lime)');
      expect(getRatingColor('2.0')).toBe('var(--sonar-lime)');
      expect(getRatingColor(2)).toBe('var(--sonar-lime)');

      expect(getRatingColor('3')).toBe('var(--sonar-yellow)');
      expect(getRatingColor('3.0')).toBe('var(--sonar-yellow)');
      expect(getRatingColor(3)).toBe('var(--sonar-yellow)');

      expect(getRatingColor('4')).toBe('var(--sonar-orange)');
      expect(getRatingColor('4.0')).toBe('var(--sonar-orange)');
      expect(getRatingColor(4)).toBe('var(--sonar-orange)');

      expect(getRatingColor('5')).toBe('var(--sonar-red)');
      expect(getRatingColor('5.0')).toBe('var(--sonar-red)');
      expect(getRatingColor(5)).toBe('var(--sonar-red)');
    });

    it('defaults to green when rating is undefined or null', () => {
      expect(getRatingColor(undefined)).toBe('var(--sonar-green)');
      expect(getRatingColor(null as unknown as string)).toBe('var(--sonar-green)');
    });

    it('falls back to green on unknown/unsupported ratings (lines 76-77)', () => {
      expect(getRatingColor('F')).toBe('var(--sonar-green)');
      expect(getRatingColor('UNKNOWN')).toBe('var(--sonar-green)');
      expect(getRatingColor('99')).toBe('var(--sonar-green)');
      expect(getRatingColor(0)).toBe('var(--sonar-green)');
      expect(getRatingColor('')).toBe('var(--sonar-green)');
    });
  });

  describe('shouldTriggerCelebration', () => {
    it('triggers when Quality Gate transitions from ERROR to OK', () => {
      const res = shouldTriggerCelebration('ERROR', 'OK', 5);
      expect(res.trigger).toBe(true);
      expect(res.reason).toBe('gate-passed');
    });

    it('triggers when total open issues reaches zero', () => {
      const res = shouldTriggerCelebration('OK', 'OK', 0);
      expect(res.trigger).toBe(true);
      expect(res.reason).toBe('zero-issues');
    });

    it('triggers when gate was not ERROR to OK, but total issues is 0', () => {
      const res = shouldTriggerCelebration('WARN', 'WARN', 0);
      expect(res.trigger).toBe(true);
      expect(res.reason).toBe('zero-issues');
    });

    it('does not trigger when gate has not improved and issues remain', () => {
      const res = shouldTriggerCelebration('ERROR', 'ERROR', 12);
      expect(res.trigger).toBe(false);
      expect(res.reason).toBeNull();

      const stable = shouldTriggerCelebration('OK', 'OK', 4);
      expect(stable.trigger).toBe(false);
      expect(stable.reason).toBeNull();
    });

    it('handles undefined or null gate statuses gracefully', () => {
      const nullPrev = shouldTriggerCelebration(null, 'OK', 3);
      expect(nullPrev.trigger).toBe(false);
      expect(nullPrev.reason).toBeNull();

      const undefCurrent = shouldTriggerCelebration('ERROR', undefined, 3);
      expect(undefCurrent.trigger).toBe(false);
      expect(undefCurrent.reason).toBeNull();

      const bothNull = shouldTriggerCelebration(null, null, 1);
      expect(bothNull.trigger).toBe(false);
      expect(bothNull.reason).toBeNull();
    });

    it('invokes trigger handlers correctly in celebratory subscriber pattern (vi.fn)', () => {
      const onGatePassed = vi.fn();
      const onZeroIssues = vi.fn();
      const onNoCelebration = vi.fn();

      const handleCelebration = (
        prev: string | null | undefined,
        curr: string | null | undefined,
        issues: number,
      ) => {
        const { trigger, reason } = shouldTriggerCelebration(prev, curr, issues);
        if (trigger && reason === 'gate-passed') {
          onGatePassed();
        } else if (trigger && reason === 'zero-issues') {
          onZeroIssues();
        } else {
          onNoCelebration();
        }
      };

      handleCelebration('ERROR', 'OK', 5);
      expect(onGatePassed).toHaveBeenCalledTimes(1);
      expect(onZeroIssues).not.toHaveBeenCalled();

      handleCelebration('OK', 'OK', 0);
      expect(onZeroIssues).toHaveBeenCalledTimes(1);

      handleCelebration('OK', 'OK', 10);
      expect(onNoCelebration).toHaveBeenCalledTimes(1);
    });
  });
});
