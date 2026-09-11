import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { passwordSchema } from '@pathcare/validators';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input } from '../components/atoms';
import Icon from '../components/atoms/Icon.jsx';

/**
 * Setting your own password.
 *
 * Staff accounts are created by an admin, who reads the generated password off
 * their screen to pass it on. Until it is replaced, that admin holds a working
 * credential for someone else's account — and a doctor's account can read
 * patient names and reports. The server blocks such an account from doing
 * anything else (`PASSWORD_CHANGE_REQUIRED`), so without this page a new
 * phlebotomist signs in and hits a wall.
 *
 * Also reachable voluntarily by anyone who simply wants to change theirs.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, api, updateUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const forced = Boolean(user?.mustChangePassword);

  // Checked against the same schema the server enforces, so the page cannot
  // accept something the API will then reject.
  const strength = useMemo(() => {
    if (!newPassword) return null;
    const result = passwordSchema.safeParse(newPassword);
    if (result.success) return { ok: true, message: 'Meets the requirements' };
    return {
      ok: false,
      message: `Still needs ${(result.error.issues ?? [])
        .map((issue) =>
          issue.message.replace(/^Password must (contain at least one |be at least )/i, '')
        )
        .join(', ')}`,
    };
  }, [newPassword]);

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    currentPassword.length > 0 && strength?.ok && !mismatch && confirmPassword.length > 0;

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setError('');
    setSubmitting(true);

    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });

      // Clear the flag locally too. The server has cleared it, but the gate
      // that sent them here reads the client's copy — without this it bounces
      // them straight back to this form, forever.
      updateUser({ mustChangePassword: false });

      // Straight to work. Landing them back on a form they have just completed
      // reads as a failure.
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ||
          err?.message ||
          'Could not change your password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-border bg-white p-7 shadow-card">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue50 text-blue600">
            <Icon name="lock" size={20} strokeWidth={2.1} />
          </span>

          <h1 className="mt-5 text-[24px] font-extrabold tracking-[-0.02em] text-ink">
            {forced ? 'Set your own password' : 'Change your password'}
          </h1>
          <p className="mt-2 text-bodySmall leading-relaxed text-muted">
            {forced
              ? 'Your account was created for you, so someone else knows the password you just used. Choose your own and theirs stops working.'
              : 'Choose a new password for your account.'}
          </p>

          {error && (
            <div
              role="alert"
              data-testid="change-password-error"
              className="mt-5 flex items-start gap-2.5 rounded-md border border-red bg-redBg px-3.5 py-3"
            >
              <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-redDark" />
              <span className="text-caption leading-relaxed text-redDark">{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="change-password-form">
            <Input
              label={forced ? 'The password you were given' : 'Current password'}
              type={show ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="current-password"
              autoComplete="current-password"
            />

            <div>
              <div className="relative">
                <Input
                  label="New password"
                  type={show ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="new-password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((visible) => !visible)}
                  aria-label={show ? 'Hide passwords' : 'Show passwords'}
                  data-testid="toggle-visibility"
                  className="absolute right-3 top-[36px] text-muted transition hover:text-ink"
                >
                  <Icon name={show ? 'eyeOff' : 'eye'} size={17} strokeWidth={2} />
                </button>
              </div>

              {strength && (
                <p
                  data-testid="password-strength"
                  className={`mt-1.5 text-caption ${strength.ok ? 'text-green' : 'text-muted'}`}
                >
                  {strength.message}
                </p>
              )}
            </div>

            <div>
              <Input
                label="Confirm new password"
                type={show ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="confirm-password"
                autoComplete="new-password"
              />
              {mismatch && (
                <p className="mt-1.5 text-caption text-redDark" data-testid="password-mismatch">
                  These do not match.
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={!canSubmit || submitting}
              data-testid="change-password-submit"
            >
              {submitting ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        </div>

        {forced && (
          <p className="mt-4 text-center text-caption leading-relaxed text-muted">
            You will not be able to use the rest of the app until this is done.
          </p>
        )}
      </div>
    </div>
  );
}
