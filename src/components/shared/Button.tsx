/**
 * Standardized Button Component
 * 
 * Provides consistent button styling across the application with variants,
 * sizes, and states.
 */

import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Button content */
  children: ReactNode;
  /** Whether button is full width */
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-scripture-accent text-scripture-bg hover:bg-scripture-accent/90 active:bg-scripture-accent/80',
  secondary: 'bg-scripture-elevated text-scripture-text border border-scripture-border/50 hover:bg-scripture-border/50 active:bg-scripture-border',
  destructive: 'bg-scripture-error text-white hover:bg-scripture-error/90 active:bg-scripture-error/80',
  ghost: 'bg-scripture-muted/20 text-scripture-text hover:bg-scripture-muted/30 active:bg-scripture-muted/40',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  const baseClasses = 'font-ui rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-scripture-accent focus:ring-offset-2 focus:ring-offset-scripture-surface';
  const variantClasses = VARIANT_CLASSES[variant];
  const sizeClasses = SIZE_CLASSES[size];
  const widthClasses = fullWidth ? 'w-full' : '';
  const disabledClasses = disabled
    ? 'opacity-50 cursor-not-allowed'
    : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${widthClasses} ${disabledClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
