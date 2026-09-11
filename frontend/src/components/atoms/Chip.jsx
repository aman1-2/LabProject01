import React from 'react';

/**
 * Chip / Badge component conforming to DESIGN_SPEC §2.3:
 * border-radius 999px, padding 6px 12px, font-size 12px, weight 700.
 */
export function Chip({
  children,
  variant = 'blue', // 'blue' | 'grey' | 'green' | 'amber' | 'red'
  className = '',
  onClick,
  ...props
}) {
  const baseClasses =
    'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption font-bold transition-colors select-none';

  const variants = {
    blue: 'bg-blue100 text-blue700',
    grey: 'bg-chipGreyBg text-muted',
    green: 'bg-greenBg text-green',
    amber: 'bg-amberBg text-amberDark',
    red: 'bg-redBg text-redDark',
  };

  const interactiveClasses = onClick ? 'cursor-pointer hover:opacity-80' : '';

  return (
    <span
      onClick={onClick}
      className={`${baseClasses} ${variants[variant] || variants.blue} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export default Chip;
