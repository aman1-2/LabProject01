import React, { forwardRef } from 'react';

/**
 * Input component conforming to DESIGN_SPEC §2.4:
 * border-radius 12px, padding 12px 16px, font-size 14.5px, background white.
 * Focus: border-color blue600 + box-shadow 0 0 0 4px blue100 (Required accessibility affordance).
 */
export const Input = forwardRef(function Input(
  {
    label,
    error,
    id,
    type = 'text',
    className = '',
    containerClassName = '',
    ...props
  },
  ref
) {
  const inputId = id || props.name;

  return (
    <div className={`w-full ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-caption font-bold text-ink mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={`w-full border-[1.5px] border-border rounded-md px-4 py-3 text-body bg-white outline-none transition-all duration-150 placeholder:text-muted2 focus:border-blue600 focus:ring-4 focus:ring-blue100 disabled:bg-chipGreyBg disabled:cursor-not-allowed ${
          error ? 'border-red focus:border-red focus:ring-redBg' : ''
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="text-red text-caption font-medium mt-1 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
