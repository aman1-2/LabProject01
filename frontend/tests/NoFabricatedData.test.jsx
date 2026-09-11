import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RiderContactCard from '../src/components/tracking/RiderContactCard.jsx';
import { WhatsAppFab } from '../src/components/layout/WhatsAppFab.jsx';

/**
 * HIGH H9 / H10 regression.
 *
 * CONTEXT §3.1 forbids any value shown to a patient that is not computed from a
 * real record. Two shipped violations:
 *
 *   H9  RiderContactCard fell back to the name 'Arjun Mehta' and the phone
 *       '+91 98765 43210', both wired into tel: and wa.me links, and displayed
 *       a hardcoded '4.9★' rating for which no field exists anywhere.
 *   H10 WhatsAppFab linked every "Book on WhatsApp" click on every patient page
 *       to the hardcoded number 919876543210.
 */
describe('HIGH H9 — RiderContactCard shows no fabricated identity', () => {
  it('renders an honest pending state when no rider is assigned', () => {
    render(<RiderContactCard rider={null} />);

    expect(screen.getByTestId('rider-contact-card-pending')).toBeInTheDocument();
    expect(screen.getByText(/Assigning your phlebotomist/i)).toBeInTheDocument();
  });

  it('never renders the placeholder name or phone number', () => {
    const { container } = render(<RiderContactCard rider={{}} />);

    expect(container.textContent).not.toMatch(/Arjun Mehta/);
    expect(container.innerHTML).not.toMatch(/98765\s?43210/);
  });

  it('never renders a star rating — no rating field exists in the data model', () => {
    const { container } = render(
      <RiderContactCard rider={{ name: 'Real Assigned Rider', phone: '9000000001' }} />
    );

    expect(container.textContent).not.toMatch(/★/);
    expect(container.textContent).not.toMatch(/4\.9/);
  });

  it('shows the real rider when one is actually assigned', () => {
    render(<RiderContactCard rider={{ name: 'Real Assigned Rider', phone: '9000000001' }} />);

    expect(screen.getByTestId('rider-name')).toHaveTextContent('Real Assigned Rider');
    expect(screen.getByTestId('rider-call-button')).not.toBeDisabled();
  });

  it('disables call and WhatsApp when the rider has no contact number', () => {
    render(<RiderContactCard rider={{ name: 'Rider Without Phone' }} />);

    expect(screen.getByTestId('rider-call-button')).toBeDisabled();
    expect(screen.getByTestId('rider-whatsapp-button')).toBeDisabled();
  });
});

describe('HIGH H10 — WhatsApp FAB carries no hardcoded number', () => {
  it('renders nothing when no support number is configured', () => {
    // import.meta.env.VITE_WHATSAPP_NUMBER is unset in the test environment.
    const { container } = render(<WhatsAppFab />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not contain the placeholder number anywhere', () => {
    const { container } = render(<WhatsAppFab />);

    expect(container.innerHTML).not.toMatch(/919876543210/);
  });
});
