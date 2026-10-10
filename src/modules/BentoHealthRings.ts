/**
 * Bento Health Rings & Celebration helpers.
 * Calculates SVG circular ring geometries, rating colors, and celebratory trigger conditions.
 */

export interface HealthRingCalc {
  dashArray: number;
  dashOffset: number;
  strokeColor: string;
}

export const CIRCUMFERENCE_R14 = 87.96;

/**
 * Calculates stroke-dasharray and stroke-dashoffset for coverage percentage donut rings.
 */
export function calculateCoverageRing(percentage: number): HealthRingCalc {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const dashOffset =
    Math.round((CIRCUMFERENCE_R14 - (clamped / 100) * CIRCUMFERENCE_R14) * 100) / 100;
  let strokeColor = 'var(--sonar-red)';
  if (clamped >= 80) {
    strokeColor = 'var(--sonar-green)';
  } else if (clamped >= 50) {
    strokeColor = 'var(--sonar-yellow)';
  }
  return {
    dashArray: CIRCUMFERENCE_R14,
    dashOffset,
    strokeColor,
  };
}

/**
 * Calculates stroke-dasharray and stroke-dashoffset for duplications percentage donut rings.
 */
export function calculateDuplicationsRing(percentage: number): HealthRingCalc {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const dashOffset =
    Math.round((CIRCUMFERENCE_R14 - (clamped / 100) * CIRCUMFERENCE_R14) * 100) / 100;
  let strokeColor = 'var(--sonar-green)';
  if (clamped > 10) {
    strokeColor = 'var(--sonar-red)';
  } else if (clamped > 3) {
    strokeColor = 'var(--sonar-yellow)';
  }
  return {
    dashArray: CIRCUMFERENCE_R14,
    dashOffset,
    strokeColor,
  };
}

/**
 * Maps rating letter or numeric score to standard theme color.
 */
export function getRatingColor(rating: string | number | undefined): string {
  const r = String(rating ?? 'A')
    .toUpperCase()
    .trim();
  if (r === 'A' || r === '1' || r === '1.0') {
    return 'var(--sonar-green)';
  }
  if (r === 'B' || r === '2' || r === '2.0') {
    return 'var(--sonar-lime)';
  }
  if (r === 'C' || r === '3' || r === '3.0') {
    return 'var(--sonar-yellow)';
  }
  if (r === 'D' || r === '4' || r === '4.0') {
    return 'var(--sonar-orange)';
  }
  if (r === 'E' || r === '5' || r === '5.0') {
    return 'var(--sonar-red)';
  }
  return 'var(--sonar-green)';
}

/**
 * Evaluates whether a celebration micro-animation should trigger.
 */
export function shouldTriggerCelebration(
  prevGateStatus: string | null | undefined,
  currentGateStatus: string | null | undefined,
  totalOpenIssues: number,
): { trigger: boolean; reason: 'gate-passed' | 'zero-issues' | null } {
  if (prevGateStatus === 'ERROR' && currentGateStatus === 'OK') {
    return { trigger: true, reason: 'gate-passed' };
  }
  if (totalOpenIssues === 0) {
    return { trigger: true, reason: 'zero-issues' };
  }
  return { trigger: false, reason: null };
}
