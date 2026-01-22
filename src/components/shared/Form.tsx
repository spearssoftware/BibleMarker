/**
 * Standardized Form Components
 * 
 * Provides consistent form input styling across the application.
 */

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, LabelHTMLAttributes, ReactNode, forwardRef } from 'react';

// Base input classes used by all form inputs
const BASE_INPUT_CLASSES = 'w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text transition-colors';

// Label component
interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  /** Whether this field is required */
  required?: boolean;
  /** Help text to display below the label */
  helpText?: string;
}

export function Label({ 
  children, 
  required, 
  helpText,
  className = '',
  ...props 
}: LabelProps) {
  return (
    <label className={`block text-sm font-medium text-scripture-text mb-2 ${className}`} {...props}>
      {children}
      {required && <span className="text-scripture-error ml-1" aria-label="required">*</span>}
      {helpText && <span className="text-xs text-scripture-muted ml-2 font-normal">({helpText})</span>}
    </label>
  );
}

// Input component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text (optional, use Label component separately for more control) */
  label?: string;
  /** Help text displayed below input */
  helpText?: string;
  /** Error message to display */
  error?: string;
}

export function Input({
  label,
  helpText,
  error,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <input
        id={inputId}
        className={`${BASE_INPUT_CLASSES} placeholder-scripture-muted ${hasError ? 'border-scripture-error focus:border-scripture-error' : ''} ${className}`}
        aria-invalid={hasError}
        aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={`${inputId}-help`} className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
}

// Textarea component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text (optional, use Label component separately for more control) */
  label?: string;
  /** Help text displayed below textarea */
  helpText?: string;
  /** Error message to display */
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  helpText,
  error,
  className = '',
  id,
  ...props
}, ref) => {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={textareaId}>{label}</Label>}
      <textarea
        ref={ref}
        id={textareaId}
        className={`${BASE_INPUT_CLASSES} placeholder-scripture-muted resize-none ${hasError ? 'border-scripture-error focus:border-scripture-error' : ''} ${className}`}
        aria-invalid={hasError}
        aria-describedby={error ? `${textareaId}-error` : helpText ? `${textareaId}-help` : undefined}
        {...props}
      />
      {error && (
        <p id={`${textareaId}-error`} className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={`${textareaId}-help`} className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

// Select component
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Label text (optional, use Label component separately for more control) */
  label?: string;
  /** Help text displayed below select */
  helpText?: string;
  /** Error message to display */
  error?: string;
  /** Select options */
  options: Array<{ value: string; label: string }>;
}

export function Select({
  label,
  helpText,
  error,
  options,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <select
        id={selectId}
        className={`${BASE_INPUT_CLASSES} ${hasError ? 'border-scripture-error focus:border-scripture-error' : ''} ${className}`}
        aria-invalid={hasError}
        aria-describedby={error ? `${selectId}-error` : helpText ? `${selectId}-help` : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={`${selectId}-help`} className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
}

// FormField wrapper component for consistent spacing
interface FormFieldProps {
  children: ReactNode;
  /** Additional className */
  className?: string;
}

export function FormField({ children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      {children}
    </div>
  );
}

// Checkbox component
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Help text displayed below checkbox */
  helpText?: string;
  /** Error message to display */
  error?: string;
}

export function Checkbox({
  label,
  helpText,
  error,
  className = '',
  id,
  ...props
}: CheckboxProps) {
  const checkboxId = id || (label ? `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={checkboxId}
          className={`w-4 h-4 rounded border-scripture-border text-scripture-accent focus:ring-2 focus:ring-scripture-accent focus:ring-offset-0 cursor-pointer ${hasError ? 'border-scripture-error' : ''} ${className}`}
          aria-invalid={hasError}
          aria-describedby={error ? `${checkboxId}-error` : helpText ? `${checkboxId}-help` : undefined}
          {...props}
        />
        {label && (
          <label
            htmlFor={checkboxId}
            className="text-sm text-scripture-text cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
      {error && (
        <p id={`${checkboxId}-error`} className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={`${checkboxId}-help`} className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
}

// Radio component
interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Help text displayed below radio */
  helpText?: string;
  /** Error message to display */
  error?: string;
}

export function Radio({
  label,
  helpText,
  error,
  className = '',
  id,
  ...props
}: RadioProps) {
  const radioId = id || (label ? `radio-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="radio"
          id={radioId}
          className={`w-4 h-4 text-scripture-accent focus:ring-2 focus:ring-scripture-accent focus:ring-offset-0 cursor-pointer ${hasError ? 'border-scripture-error' : ''} ${className}`}
          aria-invalid={hasError}
          aria-describedby={error ? `${radioId}-error` : helpText ? `${radioId}-help` : undefined}
          {...props}
        />
        {label && (
          <label
            htmlFor={radioId}
            className="text-sm text-scripture-text cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
      {error && (
        <p id={`${radioId}-error`} className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={`${radioId}-help`} className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
}

// RadioGroup component for grouping related radio buttons
interface RadioGroupProps {
  /** Group label */
  label?: string;
  /** Help text for the group */
  helpText?: string;
  /** Error message for the group */
  error?: string;
  /** Radio options */
  options: Array<{ value: string; label: string; helpText?: string }>;
  /** Selected value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Name attribute for radio group */
  name: string;
  /** Additional className */
  className?: string;
}

export function RadioGroup({
  label,
  helpText,
  error,
  options,
  value,
  onChange,
  name,
  className = '',
}: RadioGroupProps) {
  const groupId = `radio-group-${name}`;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label>{label}</Label>}
      <div className="space-y-2">
        {options.map((option) => (
          <Radio
            key={option.value}
            id={`${groupId}-${option.value}`}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange(e.target.value)}
            label={option.label}
            helpText={option.helpText}
          />
        ))}
      </div>
      {error && (
        <p className="text-xs text-scripture-error" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p className="text-xs text-scripture-muted">
          {helpText}
        </p>
      )}
    </div>
  );
}

// Read-only field component
interface ReadOnlyFieldProps {
  /** Label text */
  label: string;
  /** Field value */
  value: string | ReactNode;
  /** Additional className for the value container */
  className?: string;
}

export function ReadOnlyField({ label, value, className = '' }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className={`px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg text-scripture-text ${className}`}>
        {value}
      </div>
    </div>
  );
}
