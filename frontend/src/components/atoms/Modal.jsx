import React, { useEffect } from 'react';

/**
 * Modal component conforming to prototype .modal-overlay and .modal-box:
 * Radius 22px, padding 30px, max-width 460px, blurred backdrop overlay.
 */
export function Modal({ isOpen, onClose, title, children, className = '' }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-dark/55 backdrop-blur-[5px] z-50 flex items-center justify-center p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-[22px] max-w-[460px] w-full p-[30px] relative max-h-[85vh] overflow-y-auto shadow-float ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-[18px] right-[18px] w-8 h-8 rounded-pill bg-chipGreyBg flex items-center justify-center text-muted hover:text-ink cursor-pointer transition select-none"
          >
            ✕
          </button>
        )}
        {title && (
          <h2 className="text-pageTitle font-extrabold text-ink mb-4">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
