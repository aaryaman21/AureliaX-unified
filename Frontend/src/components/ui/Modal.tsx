import React, {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  className?: string;
}

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [isOpen]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';

      // Only perform initial auto-focus when transitioning from closed to open
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        previousFocusRef.current = document.activeElement as HTMLElement;

        requestAnimationFrame(() => {
          if (!modalRef.current) return;
          // If focus is already inside the modal, do not disrupt it
          if (modalRef.current.contains(document.activeElement)) return;

          // Prefer focusing the first input or textarea inside modal body; fallback to first focusable
          const firstInput = modalRef.current.querySelector<HTMLElement>(
            'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
          );
          const firstFocusable = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
          const target = firstInput || firstFocusable || modalRef.current;
          target?.focus();
        });
      }

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        if (previousFocusRef.current) {
          previousFocusRef.current.focus();
        }
      }
    }
  }, [isOpen, handleKeyDown]);

  // Clean up overflow if unmounted while open
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClassNames = [
    styles.modal,
    styles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={modalClassNames}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
