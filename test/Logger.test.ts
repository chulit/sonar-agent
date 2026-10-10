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

  it('formats non-Error error details in Logger.error', () => {
    Logger.error('Failed with string', 'Server unavailable');
    expect(mockChannel.error).toHaveBeenCalledWith('Failed with string - Server unavailable');

    Logger.error('Failed with number', 503);
    expect(mockChannel.error).toHaveBeenCalledWith('Failed with number - 503');

    Logger.error('Failed with boolean', false);
    expect(mockChannel.error).toHaveBeenCalledWith('Failed with boolean - false');

    Logger.error('Failed with object', { status: 500, reason: 'down' });
    expect(mockChannel.error).toHaveBeenCalledWith(
      'Failed with object - {"status":500,"reason":"down"}',
    );

    // Circular object triggering catch
    const circular: any = {};
    circular.self = circular;
    Logger.error('Failed with circular', circular);
    expect(mockChannel.error).toHaveBeenCalledWith('Failed with circular - [Object]');
  });

  it('supports debug, show, dispose, and auto-initialization', () => {
    Logger.debug('Debug log message');
    expect(mockChannel.debug).toHaveBeenCalledWith('Debug log message');

    Logger.show();
    expect(mockChannel.show).toHaveBeenCalledWith(true);

    Logger.dispose();
    expect(mockChannel.dispose).toHaveBeenCalled();

    // After dispose, calling info/warn/error/debug should re-initialize automatically
    Logger.info('Auto initialized');
    Logger.warn('Auto warned');
    Logger.debug('Auto debugged');
    Logger.error('Auto error');
  });
});
