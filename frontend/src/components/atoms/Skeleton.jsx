import React from 'react';

/**
 * Skeleton component for loading states
 */
export function Skeleton({ width, height, className = '', rounded = 'rounded-md' }) {
  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : '100%',
    height: height ? (typeof height === 'number' ? `${height}px` : height) : '1rem',
  };

  return (
    <div
      style={style}
      className={`bg-border animate-pulse ${rounded} ${className}`}
    />
  );
}

export default Skeleton;
