import React from 'react';
import clsx from 'clsx';
import { badgeBase, badgeVariants } from './Badge.css';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: keyof typeof badgeVariants;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'Neutral',
  className,
}) => {
  return (
    <span className={clsx(badgeBase, badgeVariants[variant], className)}>
      {children}
    </span>
  );
};
