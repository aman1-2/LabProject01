import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext.jsx';
import { colors, type, input, layout } from '../theme.js';
import { Banner, FieldLabel, GhostButton } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { BigAction } from '../components/bigAction.jsx';

/**
 * Sign-in. Layout follows the prototype's `#screen-login`: title, subtitle, two
 * labelled fields, primary action, ghost OTP alternative.
 *
 * The first field is the account handle rather than the prototype's phone,
 * because that is what POST /api/auth/login takes. OTP sign-in does use the
 * phone number, on the second step.
 */
export default function LoginScreen() {
  const { signInWithPassword, startOtpSignIn, completeOtpSignIn } = useAuth();

  const [mode, setMode] = useState('password'); // 'password' | 'otp-request' | 'otp-verify'
  const [accountHandle, setAccountHandle] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      // The server's message is written for a person; showing our own generic
      // string instead would hide "Account locked" or "OTP expired".
      setError(err?.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const submitPassword = () =>
    run(() => signInWithPassword({ accountHandle: accountHandle.trim(), password }));

  const requestOtp = () =>
    run(async () => {
      const result = await startOtpSignIn({ phone: phone.trim() });
      if (!result?.otpToken) {
        throw { message: 'Could not start OTP sign-in. Please try again.' };
      }
      setOtpToken(result.otpToken);
      setMode('otp-verify');
    });

  const submitOtp = () => run(() => completeOtpSignIn({ otpToken, otp: otp.trim() }));

  return (
    <KeyboardAvoidingView
      style={layout.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="screen-login"
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={type.screenTitle}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to see the collections assigned to you.</Text>

        {error ? <Banner tone="red" text={error} testID="login-error" /> : null}

        {mode === 'password' ? (
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
              returnKeyType="next"
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
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={submitPassword}
              />
              {/* The same control as the patient app and the website. A rider
                  typing a password one-handed on a scooter needs it more than
                  most. */}
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

            <BigAction
              testID="btn-signin"
              icon="check"
              label="Sign In"
              hint="Start your shift"
              tone="go"
              onPress={submitPassword}
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
              returnKeyType="go"
              onSubmitEditing={requestOtp}
            />
            <BigAction
              testID="btn-send-otp"
              icon="phone"
              label="Send OTP"
              hint="Code by SMS"
              tone="go"
              onPress={requestOtp}
              loading={busy}
              disabled={phone.trim().length < 10}
              style={styles.primary}
            />
            <GhostButton
              testID="btn-use-password"
              label="Use password instead"
              onPress={() => {
                setError(null);
                setMode('password');
              }}
            />
          </View>
        ) : null}

        {mode === 'otp-verify' ? (
          <View>
            <Text style={styles.subtitle}>We sent a 6-digit code to {phone}.</Text>
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
              returnKeyType="go"
              onSubmitEditing={submitOtp}
            />
            <BigAction
              testID="btn-verify-otp"
              icon="check"
              label="Verify"
              hint="Enter and start your shift"
              tone="go"
              onPress={submitOtp}
              loading={busy}
              disabled={otp.trim().length !== 6}
            />
            <GhostButton
              testID="btn-otp-back"
              label="Use a different number"
              onPress={() => {
                setError(null);
                setOtp('');
                setOtpToken(null);
                setMode('otp-request');
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 46 },
  passwordEye: { position: 'absolute', right: 14 },
  // Prototype login body padding: 10px 24px.
  body: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  subtitle: { ...type.bodyMuted, marginTop: 6, marginBottom: 28 },
  gap: { height: 16 },
  primary: { marginTop: 24, marginBottom: 12 },
});
