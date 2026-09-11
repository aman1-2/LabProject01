import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminCreateModal from '../src/components/organisms/AdminCreateModal.jsx';
import IssuedCredentials from '../src/components/organisms/IssuedCredentials.jsx';

/**
 * The admin console's create forms.
 *
 * These mint credentials for accounts that can read patient data, so the
 * assertions worth having are about the handling of that credential and about
 * the ways a form can quietly do the wrong thing:
 *
 *   - no password field anywhere — the server chooses it;
 *   - a double-click must not create two accounts;
 *   - a failed submit must not wipe what was typed;
 *   - the password is shown once, and the dialog cannot be dismissed by
 *     accident before it has been passed on.
 */

const FIELDS = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'accountHandle', label: 'Sign-in handle', required: true },
  { name: 'phone', label: 'Mobile number', required: true },
  {
    name: 'labCenterId',
    label: 'Home centre',
    type: 'select',
    required: true,
    options: [{ value: 'lab-1', label: 'Sunrise Diagnostics' }],
  },
  { name: 'nabl', label: 'NABL accredited', type: 'checkbox' },
];

function renderModal(onSubmit, props = {}) {
  return render(
    <MemoryRouter>
      <AdminCreateModal
        isOpen
        onClose={() => {}}
        title="Add a phlebotomist"
        fields={FIELDS}
        onSubmit={onSubmit}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('AdminCreateModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never offers a password field', () => {
    renderModal(vi.fn());

    // The server generates it. A field here would be an admin-chosen password
    // the admin keeps a copy of.
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
    const body = document.body.textContent.toLowerCase();
    expect(body).not.toContain('password');
  });

  it('submits exactly what was typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);

    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Arjun Mehta' } });
    fireEvent.change(screen.getByTestId('field-accountHandle'), { target: { value: 'rider_arjun' } });
    fireEvent.change(screen.getByTestId('field-phone'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByTestId('field-labCenterId'), { target: { value: 'lab-1' } });
    fireEvent.click(screen.getByTestId('field-nabl'));

    fireEvent.submit(screen.getByTestId('admin-create-form'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Arjun Mehta',
      accountHandle: 'rider_arjun',
      phone: '9876543210',
      labCenterId: 'lab-1',
      nabl: true,
    });
  });

  it('does not create two accounts on a double submit', async () => {
    let resolve;
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r; }));
    renderModal(onSubmit);

    fireEvent.submit(screen.getByTestId('admin-create-form'));
    fireEvent.submit(screen.getByTestId('admin-create-form'));

    // Two accounts means two passwords, and only one of them gets shown.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('admin-create-submit')).toBeDisabled();

    resolve();
    await waitFor(() => expect(screen.getByTestId('admin-create-submit')).toBeEnabled());
  });

  it('shows the server’s message when creation fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      response: { data: { error: { message: 'The handle "rider_arjun" is already taken' } } },
    });
    renderModal(onSubmit);

    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Arjun' } });
    fireEvent.submit(screen.getByTestId('admin-create-form'));

    // The server names the specific clash; replacing it with something generic
    // sends the admin back to guess which field was wrong.
    expect(await screen.findByTestId('admin-create-error')).toHaveTextContent(/already taken/i);
  });

  it('keeps what was typed when the submit fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network Error'));
    renderModal(onSubmit);

    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Arjun Mehta' } });
    fireEvent.submit(screen.getByTestId('admin-create-form'));

    await screen.findByTestId('admin-create-error');
    // Otherwise a typo in the phone number costs you the whole form.
    expect(screen.getByTestId('field-name')).toHaveValue('Arjun Mehta');
  });

  it('clears the form after a successful create', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);

    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Arjun Mehta' } });
    fireEvent.submit(screen.getByTestId('admin-create-form'));

    // So the next one does not start pre-filled with the last person's name.
    await waitFor(() => expect(screen.getByTestId('field-name')).toHaveValue(''));
  });
});

describe('IssuedCredentials', () => {
  const credentials = { accountHandle: 'rider_arjun', password: 'Pnp26MAecN5JGq' };

  it('shows the handle and the password', () => {
    render(<IssuedCredentials subject="Phlebotomist" credentials={credentials} onClose={vi.fn()} />);

    expect(screen.getByTestId('issued-handle')).toHaveTextContent('rider_arjun');
    expect(screen.getByTestId('issued-password')).toHaveTextContent('Pnp26MAecN5JGq');
  });

  it('says plainly that it will not be shown again', () => {
    render(<IssuedCredentials subject="Phlebotomist" credentials={credentials} onClose={vi.fn()} />);

    const body = document.body.textContent;
    expect(body).toMatch(/shown\s*once/i);
    expect(body).toMatch(/cannot be retrieved/i);
  });

  it('cannot be dismissed until the admin confirms they have it', () => {
    const onClose = vi.fn();
    render(<IssuedCredentials subject="Phlebotomist" credentials={credentials} onClose={onClose} />);

    // Dismissing this by accident loses the password for good, so the exit is
    // deliberate rather than a stray click.
    expect(screen.getByTestId('issued-done')).toBeDisabled();
    fireEvent.click(screen.getByTestId('issued-done'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('issued-acknowledge'));
    expect(screen.getByTestId('issued-done')).toBeEnabled();
    fireEvent.click(screen.getByTestId('issued-done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no way to send the credential onward from here', () => {
    render(<IssuedCredentials subject="Phlebotomist" credentials={credentials} onClose={vi.fn()} />);

    // Emailing or texting a working credential puts it in that system's logs
    // and mailboxes too. Handing it over is the admin's job, out of band.
    const body = document.body.textContent.toLowerCase();
    expect(body).not.toContain('email');
    expect(body).not.toContain('send to');
    expect(body).not.toContain('sms');
  });

  it('renders nothing without credentials', () => {
    const { container } = render(
      <IssuedCredentials subject="Phlebotomist" credentials={null} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
