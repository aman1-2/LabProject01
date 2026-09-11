import React from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

/**
 * EmptyState component conforming to DESIGN_SPEC §2.5:
 * Card with 1.5px DASHED border, radius 20px, padding 44px 24px, centered
 * Icon tile: 50x50, radius 14px, bg blue50
 * Title: weight 800, 15px
 * Body: muted, 13.5px, max-width 360px
 * CTA: small primary button
 */
export function EmptyState({
  icon = 'inbox',
  title,
  body,
  ctaText,
  onCtaClick,
  className = '',
  ...props
}) {
  return (
    <div
      className={`bg-white border-[1.5px] border-dashed border-border rounded-xl p-8 sm:py-[44px] sm:px-[24px] flex flex-col items-center justify-center text-center ${className}`}
      {...props}
    >
      <div className="w-[50px] h-[50px] rounded-[14px] bg-blue50 flex items-center justify-center text-[21px] mb-3 select-none">
        <Icon name={icon} size={21} strokeWidth={2} className="text-blue700" />
      </div>
      {title && (
        <h3 className="font-extrabold text-cardTitle text-ink mb-1.5">
          {title}
        </h3>
      )}
      {body && (
        <p className="text-muted text-bodySmall max-w-[360px] leading-relaxed mb-4">
          {body}
        </p>
      )}
      {ctaText && onCtaClick && (
        <Button variant="primary" size="small" onClick={onCtaClick}>
          {ctaText}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
