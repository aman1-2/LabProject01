import React, { useState } from 'react';
import { Button, Input, Modal } from '../atoms';
import Icon from '../atoms/Icon.jsx';

/**
 * One form for every "create" in the admin console.
 *
 * Lab centres, doctors, phlebotomists and lab desks differ only in their
 * fields, so they share this and configure it. Four hand-written forms would
 * drift in the details that matter least to write and most to get wrong —
 * which errors are shown, whether the submit button can be double-clicked,
 * whether a failed request leaves the form empty.
 *
 * WHAT THIS DOES NOT COLLECT
 *
 * A password. The server generates it and returns it once; there is no field
 * for one here and the API refuses one if sent. An admin-chosen password is a
 * password the admin keeps a copy of, and these accounts can read patient data.
 */

/**
 * @param {object[]} fields  {name, label, type?, required?, help?, options?, placeholder?}
 */
export default function AdminCreateModal({
  isOpen,
  onClose,
  title,
  description,
  fields,
  submitLabel = 'Create',
  onSubmit,
}) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setValues({});
    setError('');
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    // A second click while the first request is in flight creates a second
    // account, with a second password, and only one of them gets shown.
    if (submitting) return;

    setError('');
    setSubmitting(true);

    try {
      await onSubmit(values);
      // Cleared only on success. A failed submit that wipes what was typed
      // makes the admin re-enter a clinic address to fix a typo in a phone
      // number.
      setValues({});
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ||
          err?.message ||
          'Could not create this. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function set(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={title}>
      <form onSubmit={handleSubmit} data-testid="admin-create-form">
        {description && (
          <p className="mb-5 text-bodySmall leading-relaxed text-muted">{description}</p>
        )}

        {error && (
          <div
            role="alert"
            data-testid="admin-create-error"
            className="mb-5 flex items-start gap-2.5 rounded-md border border-red bg-redBg px-3.5 py-3"
          >
            <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-redDark" />
            <span className="text-caption leading-relaxed text-redDark">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {fields.map((field) => {
            const value = values[field.name] ?? '';

            if (field.type === 'select') {
              return (
                <div key={field.name}>
                  <label
                    htmlFor={`field-${field.name}`}
                    className="mb-1.5 block text-caption font-bold text-ink"
                  >
                    {field.label}
                    {field.required && <span className="text-red"> *</span>}
                  </label>
                  <select
                    id={`field-${field.name}`}
                    data-testid={`field-${field.name}`}
                    value={value}
                    required={field.required}
                    onChange={(e) => set(field.name, e.target.value)}
                    className="w-full rounded-md border-[1.5px] border-border bg-white px-4 py-3 text-body outline-none transition focus:border-blue600 focus:ring-4 focus:ring-blue100"
                  >
                    <option value="">Select…</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {field.help && (
                    <p className="mt-1.5 text-caption leading-relaxed text-muted">{field.help}</p>
                  )}
                </div>
              );
            }

            if (field.type === 'checkbox') {
              return (
                <label
                  key={field.name}
                  className="flex cursor-pointer items-center gap-2.5 text-bodySmall text-ink"
                >
                  <input
                    type="checkbox"
                    data-testid={`field-${field.name}`}
                    checked={Boolean(values[field.name])}
                    onChange={(e) => set(field.name, e.target.checked)}
                    className="h-4 w-4 rounded border-border text-blue600 focus:ring-blue100"
                  />
                  {field.label}
                </label>
              );
            }

            return (
              <div key={field.name}>
                <Input
                  id={`field-${field.name}`}
                  name={field.name}
                  data-testid={`field-${field.name}`}
                  label={
                    field.required ? (
                      <>
                        {field.label} <span className="text-red">*</span>
                      </>
                    ) : (
                      field.label
                    )
                  }
                  type={field.type ?? 'text'}
                  value={value}
                  required={field.required}
                  placeholder={field.placeholder}
                  onChange={(e) => set(field.name, e.target.value)}
                />
                {field.help && (
                  <p className="mt-1.5 text-caption leading-relaxed text-muted">{field.help}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex gap-3">
          <Button type="button" variant="ghost" className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={submitting}
            data-testid="admin-create-submit"
          >
            {submitting ? 'Creating…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
