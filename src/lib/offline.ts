/**
 * Offline Detection and Error Handling
 * 
 * Provides utilities for detecting offline status, handling network errors,
 * and implementing retry mechanisms for API calls.
 */

/** Network status */
export interface NetworkStatus {
  isOnline: boolean;
  lastChecked: Date;
  retryCount: number;
}

/** Retry configuration */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;  // milliseconds
  maxDelay: number;      // milliseconds
  backoffMultiplier: number;
}

/** Default retry configuration */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Assume online if can't determine
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  // Check for network-related error messages
  const networkErrorMessages = [
    'network',
    'fetch',
    'connection',
    'timeout',
    'offline',
    'failed to fetch',
    'networkerror',
  ];
  
  const errorMessage = (error.message || String(error)).toLowerCase();
  if (networkErrorMessages.some(msg => errorMessage.includes(msg))) {
    return true;
  }
  
  // Check for specific error types
  if (error instanceof TypeError && errorMessage.includes('fetch')) {
    return true;
  }
  
  // Check for HTTP status codes that indicate network issues
  if (error.statusCode && [0, 408, 502, 503, 504].includes(error.statusCode)) {
    return true;
  }
  
  return false;
}

/**
 * Get user-friendly error message for network errors
 */
export function getNetworkErrorMessage(error: any): string {
  if (!isOnline()) {
    return 'You are currently offline. Please check your internet connection and try again.';
  }
  
  if (isNetworkError(error)) {
    if (error.statusCode === 408 || error.message?.toLowerCase().includes('timeout')) {
      return 'Request timed out. Please check your internet connection and try again.';
    }
    if (error.statusCode === 503 || error.message?.toLowerCase().includes('service unavailable')) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }
    return 'Network error occurred. Please check your internet connection and try again.';
  }
  
  return error?.message || 'An error occurred. Please try again.';
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      // Check if online before attempting
      if (!isOnline() && attempt < retryConfig.maxRetries) {
        const delay = Math.min(
          retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelay
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a network error or we've exhausted retries
      if (!isNetworkError(error) || attempt >= retryConfig.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
        retryConfig.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Watch for online/offline status changes
 */
export function watchOnlineStatus(
  onStatusChange: (isOnline: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}; // No-op if not in browser
  }
  
  const handleOnline = () => onStatusChange(true);
  const handleOffline = () => onStatusChange(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Check cache status for a resource
 */
export interface CacheStatus {
  isCached: boolean;
  cachedAt?: Date;
  age?: number; // milliseconds
}

/**
 * Get cache status for a chapter
 */
export async function getCacheStatus(
  cacheKey: string,
  getCachedItem: (key: string) => Promise<{ cachedAt?: Date } | null>
): Promise<CacheStatus> {
  try {
    const cached = await getCachedItem(cacheKey);
    if (!cached || !cached.cachedAt) {
      return { isCached: false };
    }
    
    const cachedAt = cached.cachedAt instanceof Date ? cached.cachedAt : new Date(cached.cachedAt);
    const age = Date.now() - cachedAt.getTime();
    
    return {
      isCached: true,
      cachedAt,
      age,
    };
  } catch (error) {
    return { isCached: false };
  }
}
