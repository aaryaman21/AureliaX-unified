import React, {
  useId,
  useState,
} from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  type = 'text',
  className = '',
  id: externalId,
  disabled,
  ...rest
}) => {
  const generatedId = useId();
  const inputId = externalId ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === 'password';
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const wrapperClass = [
    styles.inputWrapper,
    leftIcon ? styles.hasLeftIcon : '',
    rightIcon || isPassword ? styles.hasRightIcon : '',
  ]
    .filter(Boolean)
    .join(' ');

  const outerClass = [
    styles.wrapper,
    error ? styles.error : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const describedBy = [
    error ? errorId : null,
    !error && hint ? hintId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={outerClass}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}

      <div className={wrapperClass}>
        {leftIcon && (
          <span className={styles.leftIcon} aria-hidden="true">
            {leftIcon}
          </span>
        )}

        <input
          id={inputId}
          type={resolvedType}
          className={styles.input}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...rest}
        />

        {isPassword ? (
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            {showPassword ? (
              <EyeOff size={16} strokeWidth={2} />
            ) : (
              <Eye size={16} strokeWidth={2} />
            )}
          </button>
        ) : rightIcon ? (
          <span className={styles.rightIcon} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </div>

      {error && (
        <span id={errorId} className={styles.errorText} role="alert">
          <AlertCircle size={12} strokeWidth={2.5} aria-hidden="true" />
          {error}
        </span>
      )}

      {!error && hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
};

export default Input;
