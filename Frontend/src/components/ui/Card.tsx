import React from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardVariant =
  | 'default'
  | 'elevated'
  | 'bordered'
  | 'risk-safe'
  | 'risk-suspicious'
  | 'risk-high';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  hoverable?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  hoverable = false,
  children,
  className = '',
  style,
  ...rest
}) => {
  const variantClass = styles[variant as keyof typeof styles] ?? styles.default;

  const classNames = [
    styles.card,
    variantClass,
    styles[`padding-${padding}` as keyof typeof styles],
    hoverable ? styles.hoverable : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} style={style} {...rest}>
      {children}
    </div>
  );
};

export default Card;
