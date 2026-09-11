import React from 'react';

/**
 * Toast component matching prototype .toast-pop:
 * Fixed top pill notification
 */
export function Toast({ message, icon = '✓', isVisible = false, onClose }) {
  if (!isVisible) return null;

  return (
    <div
      role="alert"
      className="fixed top-[66px] left-1/2 -translate-x-1/2 bg-dark text-white px-[22px] py-[14px] rounded-[14px] text-bodySmall font-semibold shadow-float z-50 flex items-center gap-2.5 animate-fade-in"
    >
      <span className="text-green text-sm select-none">{icon}</span>
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-2 text-muted2 hover:text-white cursor-pointer select-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default Toast;
