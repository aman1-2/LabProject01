// frontend/src/components/tracking/RiderContactCard.jsx
import React from 'react';

/**
 * Rider Contact Card conforming to DESIGN_SPEC §3.7:
 * Phlebotomist avatar, name, and circular Call / WhatsApp action buttons.
 *
 * No fabricated identity and no rating. The fallbacks here were a placeholder
 * name and a placeholder phone number wired into tel: and wa.me links, so a
 * patient whose rider data had not loaded would call a stranger. The "4.9★"
 * was invented outright -- no rating field exists on Rider or anywhere else
 * (CONTEXT §3.1).
 */
export function RiderContactCard({ rider }) {
  const name = rider?.name || rider?.userId?.name || null;
  const phone = rider?.phone || rider?.userId?.phone || null;

  // Until the assignment carries a real phlebotomist, say so plainly rather
  // than rendering someone who does not exist.
  if (!name) {
    return (
      <div
        className="bg-white border border-border rounded-card p-5 shadow-card"
        data-testid="rider-contact-card-pending"
      >
        <p className="font-bold text-sm text-ink">Assigning your phlebotomist</p>
        <p className="text-xs text-muted mt-1">
          Their name and contact details appear here as soon as a phlebotomist accepts your booking.
        </p>
      </div>
    );
  }

  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleCall = () => {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
  };

  const handleWhatsApp = () => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <div
      className="bg-white border border-border rounded-card p-5 shadow-card flex items-center gap-3.5"
      data-testid="rider-contact-card"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-pill bg-blue100 text-blue700 flex items-center justify-center font-extrabold text-sm select-none shrink-0 shadow-inner">
        {initials}
      </div>

      {/* Rider Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-ink truncate" data-testid="rider-name">
          {name}
        </p>
        <p className="text-xs text-muted mt-0.5">Your phlebotomist</p>
      </div>

      {/* Circular Action Buttons per DESIGN_SPEC §3.7 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCall}
          disabled={!phone}
          className="w-10 h-10 rounded-pill bg-[#F1F2F5] hover:bg-blue50 text-ink hover:text-blue600 flex items-center justify-center text-base transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
          title={phone ? `Call ${name}` : 'Contact number not available yet'}
          data-testid="rider-call-button"
        >
         
        </button>

        <button
          type="button"
          onClick={handleWhatsApp}
          disabled={!phone}
          className="w-10 h-10 rounded-pill bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#16A34A] flex items-center justify-center text-base transition-colors border border-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title={phone ? `WhatsApp ${name}` : 'Contact number not available yet'}
          data-testid="rider-whatsapp-button"
        >
         
        </button>
      </div>
    </div>
  );
}

export default RiderContactCard;
