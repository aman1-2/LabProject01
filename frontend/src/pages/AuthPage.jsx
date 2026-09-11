import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/atoms/Button.jsx';
import Input from '../components/atoms/Input.jsx';
import OtpModal from '../components/auth/OtpModal.jsx';
import Icon from '../components/atoms/Icon.jsx';
import { passwordSchema } from '@pathcare/validators';

/**
 * The strength meter, derived from the SAME schema the server validates with.
 *
 * Not a generic entropy score. A meter that calls something "strong" and then
 * watches the API reject it is worse than no meter: the patient has no idea
 * what to change. Reading the rules off `passwordSchema` means the meter and
 * the server cannot drift apart — add a rule there and this follows.
 */
const PASSWORD_RULE_COUNT = 3; // length, a letter, a number

function describePasswordStrength(value) {
  const result = passwordSchema.safeParse(value);

  if (result.success) {
    return {
      score: PASSWORD_RULE_COUNT,
      label: 'Meets the requirements',
      toneClass: 'bg-green',
    };
  }

  const issues = result.error.issues ?? [];
  const score = Math.max(0, PASSWORD_RULE_COUNT - issues.length);

  return {
    score,
    // The schema's own messages, lower-cased into a list, so the text always
    // names the rule that is actually failing.
    label: `Still needs ${issues
      .map((issue) => issue.message.replace(/^Password must (contain at least one |be at least )/i, ''))
      .join(', ')}`,
    toneClass: score >= 2 ? 'bg-amber' : 'bg-red',
  };
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    checkHandleAvailable,
    signup,
    verifyOtp,
    loginWithPassword,
    loginWithOtp,
    verifyLoginOtp,
  } = useAuth();

  const from = location.state?.from
    ? `${location.state.from.pathname || '/'}${location.state.from.search || ''}`
    : (typeof location.state?.from === 'string' ? location.state.from : '/');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Tab State: 'signin' | 'signup'
  const [activeTab, setActiveTab] = useState('signin');

  // Sign In Mode: 'password' | 'otp'
  const [signInMode, setSignInMode] = useState('password');

  // Sign In Form States
  const [signInHandle, setSignInHandle] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInPhone, setSignInPhone] = useState('');

  // Sign Up Form States
  const [accountType, setAccountType] = useState('single');
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState({ state: 'idle', message: '' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Separate from the sign-up toggle: revealing a password you are typing is a
  // per-field decision, and it should not persist across tabs.
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [address, setAddress] = useState('');
  const [locationCoords, setLocationCoords] = useState({ lat: 30.3165, lng: 78.0322 });
  const [locationSource, setLocationSource] = useState('manual');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Common Feedback States
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // OTP Modal State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [otpPurpose, setOtpPurpose] = useState(''); // 'signup' | 'login'
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpModalError, setOtpModalError] = useState('');

  const passwordStrength = useMemo(() => describePasswordStrength(password), [password]);

  // Live Debounced Handle Availability Check
  const handleDebounceRef = useRef(null);

  useEffect(() => {
    if (activeTab !== 'signup' || !handle) {
      setHandleStatus({ state: 'idle', message: '' });
      return;
    }

    const cleanHandle = handle.toLowerCase().trim();
    if (cleanHandle.length < 3) {
      setHandleStatus({ state: 'invalid', message: 'Must be at least 3 characters' });
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
      setHandleStatus({
        state: 'invalid',
        message: 'Only lowercase letters, numbers, and underscores allowed',
      });
      return;
    }

    setHandleStatus({ state: 'checking', message: 'Checking availability...' });
    clearTimeout(handleDebounceRef.current);

    handleDebounceRef.current = setTimeout(async () => {
      try {
        const available = await checkHandleAvailable(cleanHandle);
        if (available) {
          setHandleStatus({ state: 'available', message: 'Available' });
        } else {
          setHandleStatus({ state: 'taken', message: 'Handle is already taken' });
        }
      } catch {
        setHandleStatus({ state: 'idle', message: '' });
      }
    }, 400);

    return () => clearTimeout(handleDebounceRef.current);
  }, [handle, activeTab, checkHandleAvailable]);

  // Geolocation detection handler
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setServerError('Geolocation is not supported by your browser.');
      return;
    }

    setIsDetectingLocation(true);
    setServerError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocationCoords({ lat: latitude, lng: longitude });
        setLocationSource('geo');
        if (!address) {
          setAddress(`GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        }
        setIsDetectingLocation(false);
      },
      (err) => {
        setIsDetectingLocation(false);
        setServerError(`Could not detect location: ${err.message}. Please enter address manually.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Sign In submit handler
  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    setServerError('');

    if (signInMode === 'password') {
      const errors = {};
      if (!signInHandle.trim()) errors.signInHandle = 'Account handle is required';
      if (!signInPassword) errors.signInPassword = 'Password is required';

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }

      setIsSubmitting(true);
      try {
        await loginWithPassword(signInHandle.trim(), signInPassword);
        navigate(from, { replace: true });
      } catch (err) {
        setServerError(err.message || 'Invalid handle or password');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Mobile + OTP Sign In
      if (!/^[6-9]\d{9}$/.test(signInPhone.trim())) {
        setFormErrors({ signInPhone: 'Please enter a valid 10-digit Indian mobile number' });
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await loginWithOtp(signInPhone.trim());
        setOtpToken(res.otpToken);
        setOtpPurpose('login');
        setIsOtpModalOpen(true);
      } catch (err) {
        setServerError(err.message || 'Failed to send OTP. Please check the number.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Sign Up submit handler
  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    setServerError('');

    const errors = {};
    const cleanHandle = handle.toLowerCase().trim();

    if (!cleanHandle || cleanHandle.length < 3) {
      errors.handle = 'Handle must be at least 3 characters';
    } else if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
      errors.handle = 'Only letters, numbers, and underscores allowed';
    } else if (handleStatus.state === 'taken') {
      errors.handle = 'This handle is already taken';
    }

    if (!name.trim()) errors.name = 'Full name is required';

    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number';
    }

    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one letter and one number';
    }

    if (!address.trim()) {
      errors.address = 'Address or location is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        accountHandle: cleanHandle,
        phone: phone.trim(),
        name: name.trim(),
        password,
        accountType,
        location: {
          lat: locationCoords.lat,
          lng: locationCoords.lng,
          address: address.trim(),
          source: locationSource,
        },
      };

      const res = await signup(payload);
      setOtpToken(res.otpToken);
      setOtpPurpose('signup');
      setIsOtpModalOpen(true);
    } catch (err) {
      setServerError(err.message || 'Signup failed. Please check your details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modal OTP verify
  const handleModalVerify = async (code) => {
    setIsVerifyingOtp(true);
    setOtpModalError('');

    try {
      if (otpPurpose === 'signup') {
        await verifyOtp(otpToken, code);
      } else {
        await verifyLoginOtp(otpToken, code);
      }
      setIsOtpModalOpen(false);
      navigate(from, { replace: true });
    } catch (err) {
      setOtpModalError(err.message || 'Invalid or expired verification code');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Modal OTP resend
  const handleModalResend = async () => {
    setOtpModalError('');
    try {
      if (otpPurpose === 'signup') {
        const payload = {
          accountHandle: handle.toLowerCase().trim(),
          phone: phone.trim(),
          name: name.trim(),
          password,
          accountType,
          location: {
            lat: locationCoords.lat,
            lng: locationCoords.lng,
            address: address.trim(),
            source: locationSource,
          },
        };
        const res = await signup(payload);
        setOtpToken(res.otpToken);
      } else {
        const res = await loginWithOtp(signInPhone.trim());
        setOtpToken(res.otpToken);
      }
    } catch (err) {
      setOtpModalError(err.message || 'Failed to resend OTP. Rate limit may apply.');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col lg:flex-row">
      {/* ── LEFT: brand panel ────────────────────────────────────────────────
          Was a flat gradient with a near-invisible circle watermark. A
          photograph does the reassuring here that a gradient cannot: this is a
          stranger coming to your home to take your blood, and the page that
          asks for your phone number should look like it belongs to people who
          do that for a living. Photo is illustrative — see public/img/CREDITS.md.
      */}
      <div className="relative lg:w-1/2 overflow-hidden bg-blue900 text-white">
        <img
          src="/img/lab-tech.jpg"
          alt="A laboratory technician in a cap, mask and gloves working with samples at a bench"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Two layers, not one: a directional scrim keeps the headline legible
            at any viewport, and the brand wash keeps the photo on-palette. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(16,22,53,0.93) 0%, rgba(27,44,107,0.90) 45%, rgba(16,22,53,0.82) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, #4F72E8 0%, transparent 70%)' }}
        />

        <div className="relative z-10 flex h-full min-h-[560px] flex-col justify-between p-8 lg:p-[60px]">
          <div>
            <div className="mb-12 flex select-none items-center gap-2 text-[22px] font-extrabold text-white">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M9 12l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>PathCare</span>
            </div>

            <div className="max-w-md">
              <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3.5 py-1.5 text-caption font-bold uppercase tracking-[0.06em] text-white/90 backdrop-blur">
                <Icon name="mapPin" size={13} strokeWidth={2.4} />
                Now live in Dehradun
              </span>

              <h2 className="mt-6 text-[34px] font-extrabold leading-[1.14] tracking-[-0.02em] text-white">
                One account for your whole family&apos;s health records.
              </h2>
              <p className="mt-4 text-bodySmall leading-relaxed text-white/70">
                Book for a parent in another part of town, and see every report in one
                place.
              </p>

              {/* Glass cards rather than bare numbers: the same three claims,
                  but they read as facts about the service instead of decoration.
                  All three are verifiable on day one — no invented counts. */}
              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: 'shield', big: 'NABL & ISO', small: 'Accredited partner labs' },
                  { icon: 'clock', big: '6 hours', small: 'Typical turnaround' },
                  { icon: 'rupee', big: '₹0', small: 'Home collection fee' },
                ].map((claim) => (
                  <div
                    key={claim.big}
                    className="rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
                      <Icon name={claim.icon} size={17} strokeWidth={2.2} />
                    </span>
                    <p className="mt-3 text-bodySmall font-extrabold text-white">{claim.big}</p>
                    <p className="mt-0.5 text-caption leading-snug text-white/55">{claim.small}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-6 text-caption text-white/55">
            <span className="flex items-center gap-1.5">
              <Icon name="snowflake" size={13} strokeWidth={2.2} />
              Verified cold-chain tracking
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="lock" size={13} strokeWidth={2.2} />
              Your reports stay private to your account
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Split Screen Authentication Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-[40px]">
        <div className="w-full max-w-[400px]">
          {/* Top Pill Tabs matching prototype line 22 */}
          <div className="flex bg-blue50 rounded-[14px] p-[5px] mb-[30px] select-none">
            <button
              type="button"
              data-testid="signin-tab"
              onClick={() => {
                setActiveTab('signin');
                setServerError('');
                setFormErrors({});
              }}
              className={`flex-1 py-[11px] text-sm font-bold text-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                activeTab === 'signin'
                  ? 'bg-white text-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              data-testid="signup-tab"
              onClick={() => {
                setActiveTab('signup');
                setServerError('');
                setFormErrors({});
              }}
              className={`flex-1 py-[11px] text-sm font-bold text-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                activeTab === 'signup'
                  ? 'bg-white text-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Create Account
            </button>
          </div>

          {serverError && (
            <div className="mb-5 p-3 rounded-md bg-redBg border border-red text-redDark text-caption font-medium flex items-center gap-2">
              <Icon name="alert" size={16} className="inline-block shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* SIGN IN TAB CONTENT matching prototype lines 26-44 */}
          {activeTab === 'signin' && (
            <div>
              <h2 className="text-[26px] font-extrabold text-ink mb-1.5 tracking-[-0.02em]">
                Welcome back
              </h2>
              <p className="text-muted text-bodySmall mb-[26px]">
                Sign in to book, track and view your reports.
              </p>

              {/* Secondary Tab Row for Handle-vs-OTP per DESIGN_SPEC §3.3 */}
              <div className="flex bg-chipGreyBg p-1 rounded-md mb-5 text-caption font-semibold select-none">
                <button
                  type="button"
                  data-testid="password-mode-btn"
                  onClick={() => {
                    setSignInMode('password');
                    setFormErrors({});
                    setServerError('');
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 transition cursor-pointer ${
                    signInMode === 'password'
                      ? 'bg-white text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name="lock" size={13} strokeWidth={2.2} />
                  Handle &amp; Password
                </button>
                <button
                  type="button"
                  data-testid="otp-mode-btn"
                  onClick={() => {
                    setSignInMode('otp');
                    setFormErrors({});
                    setServerError('');
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 transition cursor-pointer ${
                    signInMode === 'otp'
                      ? 'bg-white text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name="phone" size={13} strokeWidth={2.2} />
                  Mobile &amp; OTP
                </button>
              </div>

              <form onSubmit={handleSignInSubmit} className="space-y-4">
                {signInMode === 'password' ? (
                  <>
                    <Input
                      label="Account Handle"
                      placeholder="Enter the User Handle Name"
                      value={signInHandle}
                      onChange={(e) => setSignInHandle(e.target.value)}
                      error={formErrors.signInHandle}
                    />

                    <div className="relative">
                      <Input
                        label="Password"
                        type={showSignInPassword ? 'text' : 'password'}
                        placeholder="Enter Your Password"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        error={formErrors.signInPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPassword((visible) => !visible)}
                        aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                        data-testid="toggle-signin-password"
                        className="absolute right-3 top-[36px] cursor-pointer text-muted transition hover:text-ink focus:outline-none"
                      >
                        <Icon name={showSignInPassword ? 'eyeOff' : 'eye'} size={17} strokeWidth={2} />
                      </button>
                    </div>

                    <div className="text-right">
                      {/* Was a <span onClick>, which no keyboard or screen
                          reader user could reach. It is an action, so it is a
                          button. */}
                      <button
                        type="button"
                        data-testid="forgot-password"
                        className="text-caption font-semibold text-blue600 transition hover:underline"
                        onClick={() =>
                          setServerError(
                            'Password recovery via OTP will be delivered to your registered mobile.'
                          )
                        }
                      >
                        Forgot password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      data-testid="signin-submit"
                      disabled={isSubmitting}
                      className="w-full mt-2"
                    >
                      {isSubmitting ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-caption font-bold text-ink mb-1.5">
                        Mobile Number
                      </label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3.5 py-3 rounded-l-md border border-r-0 border-border bg-bg text-muted text-body font-medium select-none">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={signInPhone}
                          onChange={(e) => setSignInPhone(e.target.value)}
                          placeholder="Enter Your Mobile Number"
                          maxLength={10}
                          className={`w-full border-[1.5px] border-border rounded-r-md px-4 py-3 text-body bg-white outline-none transition placeholder:text-muted2 focus:border-blue600 focus:ring-4 focus:ring-blue100 ${
                            formErrors.signInPhone ? 'border-red focus:border-red focus:ring-redBg' : ''
                          }`}
                        />
                      </div>
                      {formErrors.signInPhone && (
                        <p className="text-red text-caption font-medium mt-1">{formErrors.signInPhone}</p>
                      )}
                      <p className="text-caption text-muted mt-1.5">
                        We will send a 6-digit verification code (valid for 60 seconds).
                      </p>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      data-testid="signin-submit"
                      disabled={isSubmitting}
                      className="w-full mt-2"
                    >
                      {isSubmitting ? 'Sending OTP...' : 'Send Verification OTP'}
                    </Button>
                  </>
                )}

              </form>

              {/* The "OR / Continue with OTP" button that used to sit here did
                  exactly what the segmented switch above already does. Two
                  controls for one choice reads as two different things, and
                  the ghost button competed with the real submit directly above
                  it. One control, at the top, where the choice belongs. */}

              <p className="mt-6 text-center text-bodySmall text-muted">
                New here?{' '}
                <button
                  type="button"
                  data-testid="switch-to-signup"
                  className="font-bold text-blue600 transition hover:underline"
                  onClick={() => setActiveTab('signup')}
                >
                  Create an account
                </button>
              </p>
            </div>
          )}

          {/* CREATE ACCOUNT TAB CONTENT matching prototype line 4 */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              <h2 className="text-[26px] font-extrabold text-ink mb-1 tracking-[-0.02em]">
                Create Account
              </h2>
              <p className="text-muted text-bodySmall mb-4">
                Join PathCare Dehradun for doorstep pathology &amp; live tracking.
              </p>

              {/* Account Type Selector per prototype .acct-type-card */}
              <div>
                <label className="block text-caption font-bold text-ink mb-1.5">
                  Account Type <span className="font-normal text-muted">(Mutable later)</span>
                </label>
                {/* A one-word pill made people guess. The difference is worth
                    one line each, and the choice can be changed later anyway. */}
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { key: 'single', icon: 'user', label: 'Single', hint: 'Just my own tests' },
                    { key: 'family', icon: 'users', label: 'Family', hint: 'Book for parents too' },
                  ].map((option) => {
                    const selected = accountType === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={selected}
                        data-testid={`account-type-${option.key}`}
                        onClick={() => setAccountType(option.key)}
                        className={`flex cursor-pointer flex-col items-start gap-1 rounded-xl border-[1.5px] p-3.5 text-left transition ${
                          selected
                            ? 'border-blue600 bg-blue50 shadow-xs'
                            : 'border-border bg-white hover:border-blue600/40 hover:bg-bg'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            selected ? 'bg-blue600 text-white' : 'bg-chipGreyBg text-muted'
                          }`}
                        >
                          <Icon name={option.icon} size={16} strokeWidth={2.1} />
                        </span>
                        <span
                          className={`text-bodySmall font-extrabold ${
                            selected ? 'text-blue700' : 'text-ink'
                          }`}
                        >
                          {option.label}
                        </span>
                        <span className="text-caption leading-snug text-muted">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Handle with LIVE Availability */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-caption font-bold text-ink">Account Handle</label>
                  {handleStatus.state === 'checking' && (
                    <span className="text-caption text-muted flex items-center gap-1">
                      <span className="w-2.5 h-2.5 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                      Checking
                    </span>
                  )}
                  {handleStatus.state === 'available' && (
                    <span className="flex items-center gap-1 text-caption font-bold text-green">
                      <Icon name="check" size={13} strokeWidth={2.6} />
                      Available
                    </span>
                  )}
                  {handleStatus.state === 'taken' && (
                    <span className="flex items-center gap-1 text-caption font-bold text-red">
                      <Icon name="x" size={13} strokeWidth={2.6} />
                      Already taken
                    </span>
                  )}
                </div>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="Enter the Account Handler Name"
                  error={formErrors.handle}
                />
              </div>

              <Input
                label="Full Name"
                placeholder="Enter Your Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={formErrors.name}
              />

              {/* Phone */}
              <div>
                <label className="block text-caption font-bold text-ink mb-1.5">Mobile Number</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3.5 py-3 rounded-l-md border border-r-0 border-border bg-bg text-muted text-body font-medium select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter Your Phone Number"
                    maxLength={10}
                    className={`w-full border-[1.5px] border-border rounded-r-md px-4 py-3 text-body bg-white outline-none transition placeholder:text-muted2 focus:border-blue600 focus:ring-4 focus:ring-blue100 ${
                      formErrors.phone ? 'border-red focus:border-red focus:ring-redBg' : ''
                    }`}
                  />
                </div>
                {formErrors.phone && (
                  <p className="text-red text-caption font-medium mt-1">{formErrors.phone}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 8 chars, 1 letter & 1 number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={formErrors.password}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    data-testid="toggle-password"
                    className="absolute right-3 top-[36px] cursor-pointer text-muted transition hover:text-ink focus:outline-none"
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} strokeWidth={2} />
                  </button>
                </div>

                {/* Shown only once there is something to judge. It reports the
                    rules the server actually enforces - a meter that says
                    "strong" for a password the API then rejects is worse than
                    no meter at all. */}
                {password.length > 0 && (
                  <div className="mt-2" data-testid="password-strength">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((index) => (
                        <span
                          key={index}
                          className={`h-1 flex-1 rounded-pill transition-colors ${
                            index < passwordStrength.score ? passwordStrength.toneClass : 'bg-border'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-caption text-muted">{passwordStrength.label}</p>
                  </div>
                )}
              </div>

              {/* Location with Detect Button */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-caption font-bold text-ink">Service Address (Dehradun)</label>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetectingLocation}
                    className="text-caption text-blue600 hover:text-blue700 font-bold inline-flex items-center gap-1 focus:outline-none cursor-pointer"
                  >
                    {isDetectingLocation ? 'Detecting...' : 'Detect'}
                  </button>
                </div>
                <Input
                  placeholder="e.g. 14 Rajpur Road, Near Clock Tower"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setLocationSource('manual');
                  }}
                  error={formErrors.address}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                data-testid="signup-submit"
                disabled={isSubmitting}
                className="w-full mt-3"
              >
                {isSubmitting ? 'Sending OTP...' : 'Verify Mobile & Create Account'}
              </Button>

              <p className="mt-4 text-center text-bodySmall text-muted">
                Already have an account?{' '}
                <button
                  type="button"
                  data-testid="switch-to-signin"
                  className="font-bold text-blue600 transition hover:underline"
                  onClick={() => setActiveTab('signin')}
                >
                  Sign In
                </button>
              </p>
            </form>
          )}
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OtpModal
        isOpen={isOtpModalOpen}
        onClose={() => setIsOtpModalOpen(false)}
        phone={otpPurpose === 'signup' ? phone : signInPhone}
        onVerify={handleModalVerify}
        onResend={handleModalResend}
        isVerifying={isVerifyingOtp}
        error={otpModalError}
      />
    </div>
  );
}
