import React from 'react';

/**
 * Button component conforming to DESIGN_SPEC §2.1:
 * Base: border-radius 999px (fully pill), font-weight 700, padding 13px 26px, font-size 15px.
 * Buttons are ALWAYS fully pill-shaped.
 */
export function Button({
  children,
  variant = 'primary', // 'primary' | 'ghost' | 'danger'
  size = 'default', // 'default' | 'small'
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-bold rounded-pill transition-all duration-150 cursor-pointer whitespace-nowrap outline-none';

  const sizeClasses = size === 'small' ? 'px-[18px] py-[9px] text-bodySmall' : 'px-[26px] py-[13px] text-body';

  let variantClasses = '';
  if (disabled || loading) {
    variantClasses = 'bg-disabledBg text-muted2 cursor-not-allowed pointer-events-none border-none';
  } else if (variant === 'primary') {
    variantClasses = 'bg-blue600 text-white hover:bg-blue700 border-none shadow-xs';
  } else if (variant === 'ghost') {
    variantClasses = 'bg-white text-ink border-[1.5px] border-border hover:border-blue600 hover:text-blue600';
  } else if (variant === 'danger') {
    variantClasses = 'bg-red text-white hover:bg-redDark border-none';
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
