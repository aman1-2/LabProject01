import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPatientBooking, patientKeys } from '@pathcare/api';
import { startPayment } from '../catalogue/checkout.js';
import { colors, type, layout } from '../theme.js';
import { Banner, ErrorState, LoadingState, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import { formatCurrency } from '../lib/format.js';

/**
 * Razorpay Checkout, hosted in a WebView.
 *
 * The order is created server-side from the bookingId alone — no client-supplied
 * amount reaches this screen's request (CONTEXT §3.2).
 *
 * CRITICAL (§3.3): the checkout callback here updates the UI ONLY. The webhook
 * is the single source of truth for payment state, so this screen never marks a
 * booking paid; it polls the booking and reports whatever the server says. A
 * patient who closes the app mid-payment still gets the correct state, because
 * the webhook lands regardless of what this screen saw.
 */

/** Poll the booking after checkout closes, waiting for the webhook to land. */
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 40000;

function checkoutHtml({ order, bookingName }) {
  // Values are injected as JSON so a name with a quote in it cannot break out.
  const config = JSON.stringify({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency || 'INR',
    order_id: order.id ?? order.orderId,
    name: 'PathCare Diagnostics',
    description: bookingName || 'Lab test booking',
    theme: { color: colors.blue600 },
  });

  return `<!doctype html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;background:${colors.bg}">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = ${config};
  options.handler = function (response) {
    // UI signal only. The server learns about this from the webhook.
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', response: response }));
  };
  options.modal = {
    ondismiss: function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismissed' }));
    }
  };
  var rzp = new Razorpay(options);
  rzp.on('payment.failed', function (response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'failed', error: response.error }));
  });
  rzp.open();
</script>
</body>
</html>`;
}

export default function PaymentScreen({ navigation, route }) {
  const { bookingId, amount } = route.params ?? {};
  const queryClient = useQueryClient();

  const [order, setOrder] = useState(null);
  const [phase, setPhase] = useState('creating'); // creating | checkout | verifying | done | failed
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    startPayment(bookingId)
      .then((created) => {
        if (cancelled) return;
        setOrder(created);
        setPhase('checkout');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Could not start the payment.');
        setPhase('failed');
      });

    return () => {
      cancelled = true;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [bookingId]);

  /**
   * Waits for the webhook to make the booking paid. Never writes payment state
   * itself — it only reads what the server has decided.
   */
  function awaitWebhook() {
    setPhase('verifying');
    const startedAt = Date.now();

    pollTimer.current = setInterval(async () => {
      try {
        const booking = await fetchPatientBooking(bookingId);
        const current = booking?.booking ?? booking;

        if (current?.paymentStatus === 'paid') {
          clearInterval(pollTimer.current);
          await queryClient.invalidateQueries({ queryKey: patientKeys.bookings({ scope: 'home' }) });
          navigation.replace('BookingConfirmed', { bookingId });
          return;
        }

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          clearInterval(pollTimer.current);
          // Not an error: the payment may well have succeeded and the webhook
          // is simply still in flight. Saying it failed would be a lie.
          navigation.replace('BookingConfirmed', { bookingId, pendingConfirmation: true });
        }
      } catch {
        /* keep polling — a dropped request is not a failed payment */
      }
    }, POLL_INTERVAL_MS);
  }

  function onWebViewMessage(event) {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'success') {
      awaitWebhook();
    } else if (message.type === 'dismissed') {
      navigation.goBack();
    } else if (message.type === 'failed') {
      setError(message.error?.description || 'The payment did not go through.');
      setPhase('failed');
    }
  }

  if (phase === 'creating') {
    return (
      <View style={layout.screen} testID="screen-payment">
        <ScreenHeader title="Payment" onBack={navigation.goBack} />
        <LoadingState label="Preparing a secure payment…" />
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={layout.screen} testID="screen-payment">
        <ScreenHeader title="Payment" onBack={navigation.goBack} />
        <ErrorState testID="payment-error" message={error} />
        <View style={styles.footer}>
          <PrimaryButton
            testID="btn-payment-back"
            label="Back to booking"
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    );
  }

  if (phase === 'verifying') {
    return (
      <View style={layout.screen} testID="screen-payment-verifying">
        <ScreenHeader title="Payment" />
        <LoadingState label="Confirming your payment with the bank…" />
        <Text style={styles.note}>
          This can take a few seconds. You can safely leave this screen — your booking updates on its own.
        </Text>
      </View>
    );
  }

  return (
    <View style={layout.screen} testID="screen-payment">
      <ScreenHeader title={`Pay ${formatCurrency(amount)}`} onBack={navigation.goBack} />
      <Banner
        tone="blue"
        text="Payments are processed by Razorpay. PathCare never sees your card or UPI credentials."
      />
      <WebView
        testID="razorpay-webview"
        source={{ html: checkoutHtml({ order, bookingName: route.params?.testName }) }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onWebViewMessage}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: 20 },
  note: { ...type.bodyMuted, textAlign: 'center', paddingHorizontal: 32, marginTop: -20 },
});
