import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Extension manifest - configuration contract', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  const props = manifest.contributes.configuration.properties;

  it.each([
    'sonarAgent.profiles',
    'sonarAgent.activeProfileId',
    'sonarAgent.serverUrl',
    'sonarAgent.projectKey',
    'sonarAgent.defaultAgent',
  ])('registers %s so workspace updates never reject', (key) => {
    expect(props[key]).toBeDefined();
  });

  it('declares profiles as an array defaulting to empty', () => {
    expect(props['sonarAgent.profiles'].type).toBe('array');
    expect(props['sonarAgent.profiles'].default).toEqual([]);
  });
});
