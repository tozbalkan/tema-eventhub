import React from 'react';
import clsx from 'clsx';
import { inputContainer, inputElement, inputError, inputLabel } from './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className={inputContainer}>
        {label && <label className={inputLabel}>{label}</label>}
        <input
          ref={ref}
          className={clsx(inputElement, className)}
          {...props}
        />
        {error && <span className={inputError}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
