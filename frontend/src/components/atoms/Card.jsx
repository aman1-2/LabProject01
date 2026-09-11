import React from 'react';

/**
 * Card component conforming to DESIGN_SPEC §2.2:
 * bg white, border 1px solid border, border-radius 20px
 * Interactive: hover -> shadow.card
 * Selected state: border-color blue600, background blue50
 */
export function Card({
  children,
  interactive = false,
  selected = false,
  className = '',
  onClick,
  ...props
}) {
  const baseClasses = 'bg-white border border-border rounded-xl transition-all duration-180';
  const interactiveClasses = interactive
    ? 'hover:shadow-card hover:-translate-y-0.5 cursor-pointer'
    : '';
  const selectedClasses = selected ? 'border-blue600 bg-blue50' : '';

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${interactiveClasses} ${selectedClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
