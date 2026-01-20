/**
 * Loading Spinner Component
 * 
 * Reusable loading indicator for async operations.
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = 'md', text, className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div
        className={`${sizeClasses[size]} border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin`}
        aria-label="Loading"
      />
      {text && (
        <div className="text-sm text-scripture-muted animate-pulse">{text}</div>
      )}
    </div>
  );
}

/**
 * Loading Skeleton Component
 * 
 * Shows placeholder content while loading.
 */
interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-scripture-elevated rounded animate-pulse"
          style={{
            width: i === lines - 1 ? '75%' : '100%', // Last line is shorter
          }}
        />
      ))}
    </div>
  );
}
