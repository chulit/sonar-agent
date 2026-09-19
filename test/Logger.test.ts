import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../src/modules/Logger.js';

describe('Logger module', () => {
  let mockChannel: any;

  beforeEach(() => {
    mockChannel = {
      name: 'Sonar Agent',
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    };
    Logger.initialize(mockChannel);
  });

  it('should redact HTTP and HTTPS URLs from logged messages', () => {
    const raw = 'Connecting to server at http://10.15.34.9:9000/api/measures/component?key=abc';
    const sanitized = Logger.sanitize(raw);

    expect(sanitized).not.toContain('http://');
    expect(sanitized).not.toContain('10.15.34.9:9000');
    expect(sanitized).toBe('Connecting to server at [SERVER]');
  });

  it('should redact sensitive tokens and passwords from logged messages', () => {
    const raw = 'Failed with token: squ_abc1234567890def and authorization: Basic dG9rZW46';
    const sanitized = Logger.sanitize(raw);

    expect(sanitized).not.toContain('squ_abc1234567890def');
    expect(sanitized).toContain('token: [REDACTED]');
    expect(sanitized).toContain('authorization: [REDACTED]');
  });

  it('should log info, warn, and error to LogOutputChannel without URL leaks', () => {
    Logger.info('Connected to http://sonar.mycorp.internal:9000 successfully');
    expect(mockChannel.info).toHaveBeenCalledWith('Connected to [SERVER] successfully');

    Logger.warn('Warning from https://sonar.mycorp.internal/api/rules');
    expect(mockChannel.warn).toHaveBeenCalledWith('Warning from [SERVER]');

    Logger.error(
      'Connection failed to http://10.15.34.9:9000',
      new Error('Timeout at http://10.15.34.9:9000/api'),
    );
    expect(mockChannel.error).toHaveBeenCalledWith(
      'Connection failed to [SERVER] - Timeout at [SERVER]',
    );
  });
});
