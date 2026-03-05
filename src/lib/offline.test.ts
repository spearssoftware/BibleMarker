import { describe, it, expect } from 'vitest';
import { isNetworkError, getNetworkErrorMessage } from './offline';

describe('isNetworkError', () => {
  it('returns false for null/undefined', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it('returns true for TypeError with "fetch" in message', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for errors containing "network"', () => {
    expect(isNetworkError(new Error('NetworkError when attempting to fetch'))).toBe(true);
  });

  it('returns true for errors containing "connection"', () => {
    expect(isNetworkError(new Error('Connection refused'))).toBe(true);
  });

  it('returns true for errors containing "timeout"', () => {
    expect(isNetworkError(new Error('Request timeout'))).toBe(true);
  });

  it('returns true for errors containing "offline"', () => {
    expect(isNetworkError(new Error('Browser is offline'))).toBe(true);
  });

  it('returns true for objects with statusCode 0', () => {
    expect(isNetworkError({ statusCode: 0 })).toBe(true);
  });

  it('returns true for objects with statusCode 408', () => {
    expect(isNetworkError({ statusCode: 408 })).toBe(true);
  });

  it('returns true for objects with statusCode 502', () => {
    expect(isNetworkError({ statusCode: 502 })).toBe(true);
  });

  it('returns true for objects with statusCode 503', () => {
    expect(isNetworkError({ statusCode: 503 })).toBe(true);
  });

  it('returns true for objects with statusCode 504', () => {
    expect(isNetworkError({ statusCode: 504 })).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isNetworkError(new Error('Invalid JSON'))).toBe(false);
    expect(isNetworkError(new Error('Unexpected token'))).toBe(false);
  });

  it('returns false for string errors without network keywords', () => {
    expect(isNetworkError('some random error')).toBe(false);
  });
});

describe('getNetworkErrorMessage', () => {
  it('returns timeout message for error with "timeout"', () => {
    const result = getNetworkErrorMessage(new Error('Request timeout'));
    expect(result).toContain('timed out');
  });

  it('returns timeout message for statusCode 408', () => {
    const result = getNetworkErrorMessage({ statusCode: 408 });
    expect(result).toContain('timed out');
  });

  it('returns service unavailable message for statusCode 503', () => {
    const result = getNetworkErrorMessage({ statusCode: 503 });
    expect(result).toContain('temporarily unavailable');
  });

  it('returns generic network message for other network errors', () => {
    const result = getNetworkErrorMessage(new TypeError('Failed to fetch'));
    expect(result).toContain('Network error');
  });

  it('returns original error message for non-network errors', () => {
    const result = getNetworkErrorMessage(new Error('Invalid JSON'));
    expect(result).toBe('Invalid JSON');
  });

  it('returns default message for non-Error values', () => {
    const result = getNetworkErrorMessage(42);
    expect(result).toBe('An error occurred. Please try again.');
  });
});
