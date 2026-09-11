import React from 'react';

/**
 * ImageSlot component conforming to DESIGN_SPEC §2.6 & CONTEXT §7.1:
 * variants: 'photo' | 'avatar' | 'illustration'
 * Fallback: Exact gradient hero blob from DESIGN_SPEC §2.6
 * Always requires alt. Always reserves dimensions.
 */
export function ImageSlot({
  src,
  alt,
  variant = 'photo', // 'photo' | 'avatar' | 'illustration'
  width,
  height,
  aspectRatio = '16/9',
  className = '',
  ...props
}) {
  if (!alt && alt !== '') {
    console.warn('ImageSlot: "alt" prop is required for accessibility.');
  }

  // Dimensions reservation style
  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : '100%',
    height: height ? (typeof height === 'number' ? `${height}px` : height) : 'auto',
    aspectRatio: !height ? aspectRatio : undefined,
  };

  // If real src is provided, render image
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={style}
        className={`object-cover ${
          variant === 'avatar' ? 'rounded-full' : 'rounded-xl'
        } ${className}`}
        {...props}
      />
    );
  }

  // Fallback: Gradient hero blob for illustrations per DESIGN_SPEC §2.6
  if (variant === 'illustration') {
    return (
      <div
        role="img"
        aria-label={alt}
        style={style}
        className={`hero-gradient-blob rounded-2xl ${className}`}
        {...props}
      />
    );
  }

  // Avatar fallback
  if (variant === 'avatar') {
    return (
      <div
        role="img"
        aria-label={alt}
        style={style}
        className={`rounded-full bg-blue100 text-blue700 font-extrabold flex items-center justify-center select-none text-cardTitle ${className}`}
        {...props}
      >
        {alt ? alt.charAt(0).toUpperCase() : ''}
      </div>
    );
  }

  // Photo placeholder fallback
  return (
    <div
      role="img"
      aria-label={alt}
      style={style}
      className={`bg-chipGreyBg border border-border rounded-xl flex items-center justify-center text-muted select-none ${className}`}
      {...props}
    >
      <span className="text-bodySmall font-medium">{alt}</span>
    </div>
  );
}

export default ImageSlot;
