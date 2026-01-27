/**
 * Dropdown Select Component
 * 
 * Custom button-based dropdown that matches the design system.
 * Used in toolbar overlays for consistent UI.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Label } from './Form';

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  helpText?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DropdownSelect({
  value,
  onChange,
  options,
  label,
  helpText,
  error,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  // Determine if dropdown should open above or below based on available space
  const handleToggle = () => {
    if (disabled) return;
    
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      
      // Find the scrollable container
      let container: HTMLElement | null = buttonRef.current.parentElement;
      let scrollableContainer: HTMLElement | null = null;
      
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollableContainer = container;
          break;
        }
        container = container.parentElement;
      }
      
      if (scrollableContainer) {
        const containerRect = scrollableContainer.getBoundingClientRect();
        const spaceAbove = rect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - rect.bottom;
        const estimatedDropdownHeight = 240;
        setOpenAbove(spaceAbove >= estimatedDropdownHeight + 50 && spaceAbove > spaceBelow + 150);
      } else {
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const estimatedDropdownHeight = 240;
        setOpenAbove(spaceAbove >= estimatedDropdownHeight + 50 && spaceAbove > spaceBelow + 150);
      }
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        dropdownRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const hasError = !!error;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm bg-scripture-bg border rounded-lg 
                   focus:outline-none focus:border-scripture-accent text-scripture-text
                   flex items-center gap-2 justify-between hover:bg-scripture-elevated transition-colors
                   ${hasError ? 'border-scripture-error focus:border-scripture-error' : 'border-scripture-border/50'}
                   ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className={selectedOption ? '' : 'text-scripture-muted'}>{displayText}</span>
          <span className="text-scripture-muted">{isOpen ? '▲' : '▼'}</span>
        </button>
        
        {isOpen && !disabled && (
          <div
            ref={dropdownRef}
            className={`absolute z-50 w-full bg-scripture-elevated border border-scripture-border/50 
                        rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar
                        ${openAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-scripture-border/30 transition-colors
                           ${value === option.value ? 'bg-scripture-border/20' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
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
