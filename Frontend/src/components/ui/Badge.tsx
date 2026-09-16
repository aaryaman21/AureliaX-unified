import React from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant =
  | 'safe'
  | 'suspicious'
  | 'high-risk'
  | 'info'
  | 'neutral'
  | 'language'
  | 'active';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  children?: ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  pulse = false,
  children,
  className = '',
  ...rest
}) => {
  const variantClass = styles[variant as keyof typeof styles] ?? styles.neutral;

  const classNames = [
    styles.badge,
    variantClass,
    styles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} {...rest}>
      {dot && (
        <span
          className={[styles.dot, pulse ? styles.pulse : ''].filter(Boolean).join(' ')}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export default Badge;
