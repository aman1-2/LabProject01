// frontend/src/components/tracking/LiveTrackingMap.jsx
import React from 'react';
import Icon from '../atoms/Icon.jsx';

/**
 * Live Tracking Map conforming to DESIGN_SPEC §3.7 and prototype line 658:
 * Displays rider pin () + destination pin (), ETA pill, and '● Live' badge during en_route.
 */
export function LiveTrackingMap({ riderLocation, etaMinutes = 12 }) {
  // Compute visual pin position smoothly based on coords or simulated path
  const riderTop = riderLocation?.lat ? `${38 + ((riderLocation.lat * 1000) % 20)}%` : '38%';
  const riderLeft = riderLocation?.lng ? `${28 + ((riderLocation.lng * 1000) % 25)}%` : '28%';

  return (
    <div
      className="relative w-full h-[230px] rounded-card overflow-hidden mb-6 border border-border bg-[#EDF2F7]"
      data-testid="live-tracking-map"
      style={{
        backgroundImage: `radial-gradient(#CBD5E0 1.2px, transparent 1.2px), radial-gradient(#CBD5E0 1.2px, #EDF2F7 1.2px)`,
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 12px 12px',
      }}
    >
      {/* Visual Roadmap lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-blue200" strokeWidth="3" fill="none">
        <path d="M 120 180 Q 220 90, 480 140 T 780 160" strokeDasharray="6,6" />
      </svg>

      {/* Rider Pin */}
      <div
        className="absolute w-10 h-10 rounded-pill bg-blue600 text-white flex items-center justify-center text-lg shadow-elevated transform -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out z-10"
        style={{ left: riderLeft, top: riderTop }}
        data-testid="rider-map-pin"
        title="Phlebotomist on the way"
      >
        <Icon name="scooter" size={16} className="inline-block shrink-0" />
      </div>

      {/* Destination Pin */}
      <div
        className="absolute w-10 h-10 rounded-pill bg-[#16A34A] text-white flex items-center justify-center text-lg shadow-elevated transform -translate-x-1/2 -translate-y-1/2 z-10"
        style={{ left: '68%', top: '62%' }}
        data-testid="destination-map-pin"
        title="Your Location"
      >
        <Icon name="home" size={16} className="inline-block shrink-0" />
      </div>

      {/* ETA Pill */}
      <div
        className="absolute bottom-3 left-3 bg-white text-ink py-2 px-3.5 rounded-pill text-xs font-bold shadow-elevated flex items-center gap-1.5 border border-border/40 z-20"
        data-testid="map-eta-badge"
      >
        <span className="w-2 h-2 rounded-pill bg-blue600 animate-pulse" />
        <span>Arriving in about {etaMinutes} minutes</span>
      </div>

      {/* Live Badge */}
      <div
        className="absolute top-3 right-3 bg-blue600 text-white py-1.5 px-3 rounded-pill text-[11px] font-bold shadow-card flex items-center gap-1.5 z-20"
        data-testid="map-live-badge"
      >
        <span className="w-1.5 h-1.5 rounded-pill bg-white animate-ping" />
        <span>● Live</span>
      </div>
    </div>
  );
}

export default LiveTrackingMap;
