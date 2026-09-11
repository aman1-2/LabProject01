// frontend/src/components/tracking/StatusStepper.jsx
import React from 'react';
import Icon from '../atoms/Icon.jsx';

export const HOME_STAGES = [
  { key: 'pending', label: 'Booked' },
  { key: 'rider_assigned', label: 'Rider assigned' },
  { key: 'en_route', label: 'On the way' },
  { key: 'collected', label: 'Sample collected' },
  { key: 'at_lab', label: 'Received at lab' },
  { key: 'report_ready', label: 'Report ready' },
];

export const VISIT_STAGES = [
  { key: 'awaiting_confirm', label: 'Slot booked' },
  { key: 'confirmed', label: 'Confirmed by lab' },
  { key: 'collected', label: 'Sample taken' },
  { key: 'at_lab', label: 'Processing' },
  { key: 'report_ready', label: 'Report ready' },
];

/**
 * Responsive status stepper conforming to DESIGN_SPEC §3.7, §5 and prototype lines 644-657:
 * Horizontal on desktop (≥768px), VERTICAL on mobile (<768px).
 */
export function StatusStepper({ mode = 'home', status = 'pending' }) {
  const stages = mode === 'visit' ? VISIT_STAGES : HOME_STAGES;

  const currentIndex = stages.findIndex((s) => s.key === status);
  const activeIdx = currentIndex >= 0 ? currentIndex : 0;
  const isCancelled = status === 'cancelled';

  return (
    <div className="w-full" data-testid="status-stepper">
      {isCancelled ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-card text-red-700 font-medium text-sm flex items-center gap-3">
          <Icon name="alert" size={16} className="inline-block shrink-0" />
          <div>
            <p className="font-bold">Booking Cancelled</p>
            <p className="text-xs text-red-600">This booking has been cancelled and will not proceed.</p>
          </div>
        </div>
      ) : (
        <>
          {/* DESKTOP HORIZONTAL STEPPER (≥768px) */}
          <div
            className="hidden md:flex items-center justify-between w-full relative"
            data-testid="stepper-horizontal"
          >
            {stages.map((stage, idx) => {
              const isDone = idx < activeIdx;
              const isCurrent = idx === activeIdx;

              return (
                <React.Fragment key={`desktop-${stage.key}`}>
                  {/* Step Item */}
                  <div className="flex flex-col items-center relative z-10 flex-1">
                    <div
                      data-testid={`step-indicator-${stage.key}`}
                      className={`w-8 h-8 rounded-pill flex items-center justify-center font-extrabold text-xs transition-colors duration-200 ${
                        isDone || isCurrent
                          ? 'bg-blue600 text-white shadow-sm'
                          : 'bg-[#F1F2F5] text-muted2'
                      }`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <span
                      className={`text-xs mt-2 text-center font-bold whitespace-nowrap ${
                        isCurrent
                          ? 'text-blue600 font-extrabold'
                          : isDone
                          ? 'text-ink'
                          : 'text-muted2 font-medium'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {/* Connecting Bar */}
                  {idx < stages.length - 1 && (
                    <div
                      className={`h-[2px] flex-1 -mt-5 transition-colors duration-200 ${
                        idx < activeIdx ? 'bg-blue600' : 'bg-border'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* MOBILE VERTICAL STEPPER (<768px) per DESIGN_SPEC §5 */}
          <div
            className="flex md:hidden flex-col w-full"
            data-testid="stepper-vertical"
          >
            {stages.map((stage, idx) => {
              const isDone = idx < activeIdx;
              const isCurrent = idx === activeIdx;

              return (
                <div
                  key={`mobile-${stage.key}`}
                  className="flex items-start gap-3.5 relative pb-3"
                >
                  {/* Column with circle indicator & connecting line */}
                  <div className="flex flex-col items-center">
                    <div
                      data-testid={`mobile-step-indicator-${stage.key}`}
                      className={`w-7 h-7 rounded-pill flex items-center justify-center font-extrabold text-xs shrink-0 ${
                        isDone || isCurrent
                          ? 'bg-blue600 text-white shadow-sm'
                          : 'bg-[#F1F2F5] text-muted2'
                      }`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </div>

                    {/* Vertical connecting line */}
                    {idx < stages.length - 1 && (
                      <div
                        className={`w-[2px] h-7 my-1 ${
                          isDone ? 'bg-blue600' : 'bg-border'
                        }`}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <div className="pt-0.5">
                    <p
                      className={`text-sm font-bold ${
                        isCurrent
                          ? 'text-blue600 font-extrabold'
                          : isDone
                          ? 'text-ink'
                          : 'text-muted2 font-medium'
                      }`}
                    >
                      {stage.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default StatusStepper;
