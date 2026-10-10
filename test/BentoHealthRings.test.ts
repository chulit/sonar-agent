import { describe, it, expect } from 'vitest';
import {
  calculateCoverageRing,
  calculateDuplicationsRing,
  getRatingColor,
  shouldTriggerCelebration,
  CIRCUMFERENCE_R14,
} from '../src/modules/BentoHealthRings.js';

describe('BentoHealthRings', () => {
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

    it('calculates 65% medium coverage yellow ring', () => {
      const res = calculateCoverageRing(65);
      expect(res.dashOffset).toBeCloseTo(30.79, 1);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
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
  });

  describe('calculateDuplicationsRing', () => {
    it('calculates clean duplications (< 3%) with green ring', () => {
      const res = calculateDuplicationsRing(1.8);
      expect(res.strokeColor).toBe('var(--sonar-green)');
    });

    it('calculates moderate duplications (3-10%) with yellow ring', () => {
      const res = calculateDuplicationsRing(5.2);
      expect(res.strokeColor).toBe('var(--sonar-yellow)');
    });

    it('calculates heavy duplications (> 10%) with red ring', () => {
      const res = calculateDuplicationsRing(14.5);
      expect(res.strokeColor).toBe('var(--sonar-red)');
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

    it('maps numeric ratings to color variables', () => {
      expect(getRatingColor('1.0')).toBe('var(--sonar-green)');
      expect(getRatingColor(2)).toBe('var(--sonar-lime)');
      expect(getRatingColor(3)).toBe('var(--sonar-yellow)');
      expect(getRatingColor(4)).toBe('var(--sonar-orange)');
      expect(getRatingColor(5)).toBe('var(--sonar-red)');
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

    it('does not trigger when gate has not improved and issues remain', () => {
      const res = shouldTriggerCelebration('ERROR', 'ERROR', 12);
      expect(res.trigger).toBe(false);
      expect(res.reason).toBeNull();

      const stable = shouldTriggerCelebration('OK', 'OK', 4);
      expect(stable.trigger).toBe(false);
    });
  });
});
