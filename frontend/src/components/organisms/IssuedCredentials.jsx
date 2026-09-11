import React, { useState } from 'react';
import { Button, Modal } from '../atoms';
import Icon from '../atoms/Icon.jsx';

/**
 * The one time the generated password is ever visible.
 *
 * The server returns it in the create response and stores only its hash. No
 * endpoint will produce it again — if this dialog is dismissed before the
 * password reaches the person it belongs to, the account has to be recreated.
 * So the dialog says that plainly rather than looking like a receipt, and
 * closing it takes a deliberate confirmation instead of a stray click on a
 * backdrop.
 *
 * There is no "email this to them" button. Sending a working credential
 * through another system puts it in that system's logs and mailboxes too;
 * handing it over is the admin's job, out of band.
 */
export default function IssuedCredentials({ credentials, subject, onClose }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!credentials) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `Handle: ${credentials.accountHandle}\nPassword: ${credentials.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the password is on screen to read.
      setCopied(false);
    }
  }

  return (
    <Modal
      isOpen
      // Deliberately not wired to the backdrop: dismissing this by accident
      // loses the password for good.
      onClose={() => {}}
      title={`${subject} created`}
    >
      <div data-testid="issued-credentials">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber bg-amberBg px-4 py-3">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-amberDark" />
          <p className="text-caption leading-relaxed text-ink">
            This password is shown <strong>once</strong> and cannot be retrieved later. Pass it on
            now — if you lose it, the account has to be created again.
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-border bg-bg p-4">
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">
              Sign-in handle
            </p>
            <p
              className="mt-1 font-mono text-body font-extrabold text-ink"
              data-testid="issued-handle"
            >
              {credentials.accountHandle}
            </p>
          </div>
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">
              Temporary password
            </p>
            <p
              className="mt-1 select-all break-all font-mono text-body font-extrabold text-ink"
              data-testid="issued-password"
            >
              {credentials.password}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={copy}
          data-testid="issued-copy"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-border py-2.5 text-bodySmall font-bold text-ink transition hover:border-blue600 hover:text-blue600"
        >
          <Icon name={copied ? 'check' : 'clipboard'} size={15} strokeWidth={2.2} />
          {copied ? 'Copied' : 'Copy handle and password'}
        </button>

        <p className="mt-4 text-caption leading-relaxed text-muted">
          They will be asked to set their own password the first time they sign in. Until they do,
          this one works and yours is the only copy — after that, it stops working.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-bodySmall text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            data-testid="issued-acknowledge"
            className="mt-0.5 h-4 w-4 rounded border-border text-blue600 focus:ring-blue100"
          />
          I have saved this password or passed it on
        </label>

        <Button
          variant="primary"
          className="mt-5 w-full"
          disabled={!acknowledged}
          onClick={onClose}
          data-testid="issued-done"
        >
          Done
        </Button>
      </div>
    </Modal>
  );
}
