import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext.jsx';
import { LinearGradient } from 'expo-linear-gradient';
import { passwordSchema } from '@pathcare/validators';
import { colors, type, input, card, layout } from '../theme.js';
import { Banner, FieldLabel, GhostButton, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { elevation } from '../components/motion.jsx';

import { DEFAULT_LAT, DEFAULT_LNG, CITY } from '../config/locale.js';
/**
 * Sign in / create account, transcribed from the prototype's #screen-login and
 * #screen-signup.
 *
 * The prototype's login takes a phone number; the API's password login takes an
 * account handle (`loginPasswordSchema`), so that field is labelled for what it
 * actually is. OTP sign-in does use the phone number.
 *
 * The signup screen's Single / Couple / Family selector maps to
 * User.accountType, which §5.1 marks mutable — so the copy says it can change.
 */
const ACCOUNT_TYPES = [
  { key: 'single', icon: 'user', label: 'Single', hint: 'Just me' },
  { key: 'couple', icon: 'users', label: 'Couple', hint: 'Two of us' },
  { key: 'family', icon: 'users', label: 'Family', hint: 'Parents too' },
];

/** The rules the API enforces, read off the schema so the two cannot drift. */
const PASSWORD_RULE_COUNT = 3;

/**
 * Describes a password against the SAME schema the server validates with.
 *
 * Deliberately not an entropy score. Telling someone their password is
 * "strong" and then having the API reject it leaves them with nothing to act
 * on; naming the failing rule tells them exactly what to change.
 */
function describePasswordStrength(value) {
  const result = passwordSchema.safeParse(value);

  if (result.success) {
    return { score: PASSWORD_RULE_COUNT, label: 'Meets the requirements', tone: colors.green };
  }

  const issues = result.error.issues ?? [];
  const score = Math.max(0, PASSWORD_RULE_COUNT - issues.length);

  return {
    score,
    label: `Still needs ${issues
      .map((issue) =>
        issue.message.replace(/^Password must (contain at least one |be at least )/i, '')
      )
      .join(', ')}`,
    tone: score >= 2 ? colors.amber : colors.red,
  };
}

export default function AuthScreen({ initialMode = 'login', onBack }) {
  const { signInWithPassword, startOtpSignIn, completeOtpSignIn, signUp, completeSignUp } = useAuth();

  const [mode, setMode] = useState(initialMode); // login | signup | otp-request | otp-verify | signup-verify
  const [accountHandle, setAccountHandle] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('single');
  const [address, setAddress] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  const passwordStrength = describePasswordStrength(password);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      // The server's wording is written for a person and often says something
      // specific ("That code has expired"). Replacing it with a generic string
      // would hide the one useful detail (DESIGN_SPEC §6).
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const doLogin = () => run(() => signInWithPassword({ accountHandle: accountHandle.trim(), password }));

  const doRequestOtp = () =>
    run(async () => {
      const result = await startOtpSignIn({ phone: phone.trim() });
      if (!result?.otpToken) throw { message: 'Could not send a code. Please try again.' };
      setOtpToken(result.otpToken);
      setMode('otp-verify');
    });

  const doVerifyOtp = () => run(() => completeOtpSignIn({ otpToken, otp: otp.trim() }));

  const doSignUp = () =>
    run(async () => {
      const result = await signUp({
        accountHandle: accountHandle.trim(),
        phone: phone.trim(),
        name: name.trim(),
        password,
        accountType,
        // Coordinates stay the city default until the app asks for location
        // permission; the typed address is the part a phlebotomist actually
        // navigates by, so it must be the patient's own.
        location: {
          lat: DEFAULT_LAT,
          lng: DEFAULT_LNG,
          address: address.trim(),
          source: 'manual',
        },
      });
      if (!result?.otpToken) throw { message: 'Could not start sign-up. Please try again.' };
      setOtpToken(result.otpToken);
      setMode('signup-verify');
    });

  const doCompleteSignUp = () => run(() => completeSignUp({ otpToken, otp: otp.trim() }));

  const isSignup = mode === 'signup';
  const isVerifying = mode === 'otp-verify' || mode === 'signup-verify';

  return (
    <KeyboardAvoidingView
      style={layout.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="screen-auth"
    >
      <ScreenHeader title="" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* A plain heading on white made this look like a form in a settings
            app. The band gives the screen somewhere to start, and repeats the
            three claims that are true on day one — no invented counts. */}
        <LinearGradient
          colors={[colors.blue900, colors.blueGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brand}
        >
          <View style={styles.brandMark}>
            <Icon name="checkCircle" size={20} color={colors.white} strokeWidth={2.2} />
            <Text style={styles.brandName}>PathCare</Text>
          </View>
          <Text style={styles.brandLine}>Lab tests at home, reports the same day.</Text>
          <View style={styles.brandClaims}>
            {[
              { icon: 'shield', text: 'NABL & ISO' },
              { icon: 'clock', text: '6 hrs' },
              { icon: 'rupee', text: 'Free pickup' },
            ].map((claim) => (
              <View key={claim.text} style={styles.brandClaim}>
                <Icon name={claim.icon} size={12} color={colors.blue100} strokeWidth={2.3} />
                <Text style={styles.brandClaimText}>{claim.text}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <Text style={styles.title}>
          {isSignup ? 'Create your account' : isVerifying ? 'Enter your code' : 'Welcome back'}
        </Text>
        <Text style={styles.subtitle}>
          {isSignup
            ? 'Single, couple, or family — you can add members anytime.'
            : isVerifying
              ? `We sent a 6-digit code to ${phone}.`
              : 'Sign in to book, track, and view your reports.'}
        </Text>

        {error ? <Banner tone="red" text={error} testID="auth-error" /> : null}

        {mode === 'login' ? (
          <View>
            <FieldLabel>Account Handle</FieldLabel>
            <TextInput
              testID="input-handle"
              style={input.base}
              value={accountHandle}
              onChangeText={setAccountHandle}
              placeholder="Enter the User Handle Name"
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            <View style={styles.gap} />
            <FieldLabel>Password</FieldLabel>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="input-password"
                style={[input.base, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter Your Password"
                placeholderTextColor={colors.muted2}
                secureTextEntry={!showSignInPassword}
                autoComplete="current-password"
                onSubmitEditing={doLogin}
              />
              {/* The same reveal control as the website. Separate state from
                  the sign-up field: revealing a password you are typing is a
                  per-field decision and should not carry across screens. */}
              <Pressable
                testID="toggle-signin-password"
                accessibilityRole="button"
                accessibilityLabel={showSignInPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowSignInPassword((visible) => !visible)}
                hitSlop={10}
                style={styles.passwordEye}
              >
                <Icon
                  name={showSignInPassword ? 'eyeOff' : 'eye'}
                  size={18}
                  color={colors.muted}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            <Text
              testID="link-forgot-password"
              style={styles.forgot}
              onPress={() =>
                setError('Password recovery via OTP will be delivered to your registered mobile.')
              }
            >
              Forgot password?
            </Text>

            <PrimaryButton
              testID="btn-signin"
              label="Sign In"
              onPress={doLogin}
              loading={busy}
              disabled={!accountHandle.trim() || !password}
              style={styles.primary}
            />
            <GhostButton
              testID="btn-use-otp"
              label="Continue with OTP"
              onPress={() => {
                setError(null);
                setMode('otp-request');
              }}
            />
            <Text style={styles.footer}>
              New here?{' '}
              <Text
                testID="link-signup"
                style={styles.link}
                onPress={() => {
                  setError(null);
                  setMode('signup');
                }}
              >
                Create an account
              </Text>
            </Text>
          </View>
        ) : null}

        {mode === 'otp-request' ? (
          <View>
            <FieldLabel>Mobile Number</FieldLabel>
            <TextInput
              testID="input-phone"
              style={input.base}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter Your Mobile Number"
              placeholderTextColor={colors.muted2}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <PrimaryButton
              testID="btn-send-otp"
              label="Send Verification OTP"
              onPress={doRequestOtp}
              loading={busy}
              disabled={phone.trim().length < 10}
              style={styles.primary}
            />
            <GhostButton testID="btn-back-to-password" label="Use password instead" onPress={() => setMode('login')} />
          </View>
        ) : null}

        {isSignup ? (
          <View>
            {/* Prototype: three cards, selected one gets blue600 border + blue50 fill. */}
            <View style={styles.typeRow}>
              {ACCOUNT_TYPES.map((option) => {
                const selected = accountType === option.key;
                return (
                  <Pressable
                    key={option.key}
                    testID={`account-type-${option.key}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setAccountType(option.key)}
                    style={[card.base, styles.typeCard, selected && card.selected]}
                  >
                    <Icon name={option.icon} size={22} color={selected ? colors.blue700 : colors.muted} strokeWidth={2} />
                    <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.typeHint}>{option.hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            <FieldLabel>Account Handle</FieldLabel>
            <TextInput
              testID="input-signup-handle"
              style={[input.base, styles.stacked]}
              value={accountHandle}
              onChangeText={setAccountHandle}
              placeholder="Enter the Account Handler Name"
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <FieldLabel>Full Name</FieldLabel>
            <TextInput
              testID="input-name"
              style={[input.base, styles.stacked]}
              value={name}
              onChangeText={setName}
              placeholder="Enter Your Full Name"
              placeholderTextColor={colors.muted2}
              autoComplete="name"
            />

            <FieldLabel>Mobile Number</FieldLabel>
            {/* The +91 sits outside the field, as on the website, so the
                country code is never something to type or to get wrong. */}
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>+91</Text>
              </View>
              <TextInput
                testID="input-signup-phone"
                style={[input.base, styles.phoneInput]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter Your Phone Number"
                placeholderTextColor={colors.muted2}
                keyboardType="phone-pad"
                maxLength={10}
                autoComplete="tel"
            />
            </View>

            <FieldLabel>Password</FieldLabel>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="input-signup-password"
                style={[input.base, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Min 8 chars, 1 letter & 1 number"
                placeholderTextColor={colors.muted2}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <Pressable
                testID="toggle-password"
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((visible) => !visible)}
                hitSlop={10}
                style={styles.passwordEye}
              >
                <Icon
                  name={showPassword ? 'eyeOff' : 'eye'}
                  size={18}
                  color={colors.muted}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {password.length > 0 ? (
              <View style={styles.strength} testID="password-strength">
                <View style={styles.strengthBars}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            index < passwordStrength.score ? passwordStrength.tone : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.strengthLabel}>{passwordStrength.label}</Text>
              </View>
            ) : null}

            <FieldLabel>Service Address ({CITY})</FieldLabel>
            {/* The website has always collected this; the app did not, and fell
                back to a default Dehradun location. That meant a patient who
                signed up on their phone had an address on file that was not
                theirs — fine until the first home collection is dispatched to
                it. Asking here matches the web form and records the real one. */}
            <TextInput
              testID="input-signup-address"
              style={[input.base, styles.stacked]}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 14 Rajpur Road, Near Clock Tower"
              placeholderTextColor={colors.muted2}
              autoComplete="street-address"
            />

            <PrimaryButton
              testID="btn-create-account-submit"
              label="Verify Mobile & Create Account"
              onPress={doSignUp}
              loading={busy}
              disabled={
                !name.trim() ||
                !accountHandle.trim() ||
                phone.trim().length < 10 ||
                !password ||
                !address.trim()
              }
            />
            <Text style={styles.footer}>
              Already have an account?{' '}
              <Text testID="link-login" style={styles.link} onPress={() => setMode('login')}>
                Sign in
              </Text>
            </Text>
          </View>
        ) : null}

        {isVerifying ? (
          <View>
            <FieldLabel>Verification code</FieldLabel>
            <TextInput
              testID="input-otp"
              style={input.base}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              placeholderTextColor={colors.muted2}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="sms-otp"
            />
            <PrimaryButton
              testID="btn-verify-otp"
              label="Verify"
              onPress={mode === 'signup-verify' ? doCompleteSignUp : doVerifyOtp}
              loading={busy}
              disabled={otp.trim().length !== 6}
              style={styles.primary}
            />
            <GhostButton
              testID="btn-otp-back"
              label="Start over"
              onPress={() => {
                setOtp('');
                setOtpToken(null);
                setError(null);
                setMode(mode === 'signup-verify' ? 'signup' : 'otp-request');
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Prototype auth body padding: 10px 24px.
  body: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
  // Prototype h2 on auth screens: 26px / 800.
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.ink, marginBottom: 6 },
  subtitle: { ...type.bodyMuted, fontSize: 14, marginBottom: 28 },
  gap: { height: 16 },
  primary: { marginTop: 24, marginBottom: 12 },
  stacked: { marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  typeLabel: { fontSize: 12.5, fontWeight: '800', marginTop: 6, color: colors.ink },
  typeLabelSelected: { color: colors.blue700 },
  typeHint: { fontSize: 10.5, color: colors.muted, marginTop: 2, textAlign: 'center' },

  brand: { borderRadius: 20, padding: 20, marginBottom: 24, ...elevation.card },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: colors.white, fontWeight: '800', fontSize: 17, letterSpacing: -0.3 },
  brandLine: {
    color: colors.white,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
    letterSpacing: -0.4,
    marginTop: 14,
  },
  brandClaims: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  brandClaim: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandClaimText: { color: colors.blue100, fontSize: 11.5, fontWeight: '700' },

  passwordWrap: { justifyContent: 'center' },
  phoneRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 12 },
  phonePrefix: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRightWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: colors.bg,
  },
  phonePrefixText: { fontSize: 14.5, fontWeight: '600', color: colors.muted },
  phoneInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  forgot: {
    textAlign: 'right',
    marginTop: 10,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.blue600,
  },
  passwordInput: { paddingRight: 46 },
  passwordEye: { position: 'absolute', right: 14 },
  strength: { marginTop: 10, marginBottom: 4 },
  strengthBars: { flexDirection: 'row', gap: 6 },
  strengthBar: { flex: 1, height: 4, borderRadius: 999 },
  strengthLabel: { fontSize: 11.5, color: colors.muted, marginTop: 7 },
  footer: { textAlign: 'center', marginTop: 22, fontSize: 13.5, color: colors.muted },
  link: { color: colors.blue600, fontWeight: '700' },
});
