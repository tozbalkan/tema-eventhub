import React from 'react';
import clsx from 'clsx';
import { buttonBase, buttonVariants } from './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  icon,
  className,
  ...props
}) => {
  return (
    <button
      className={clsx(buttonBase, buttonVariants[variant], className)}
      {...props}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
};
