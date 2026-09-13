import React from 'react';

/**
 * Keeps one broken component from blanking the whole app.
 *
 * React unmounts the entire tree when a render throws and nothing catches it.
 * On this app that means a patient part-way through a booking — or worse,
 * mid-payment, having already been charged — is left staring at a white page
 * with no reference number, no indication of whether the booking exists, and
 * nothing to tell support.
 *
 * This does not attempt recovery. It shows what happened, offers a way back,
 * and preserves the fact that money may already have moved.
 *
 * Error boundaries only catch errors thrown while RENDERING. Failures inside
 * event handlers and promises never reach here — those are handled where they
 * happen, and the API layer surfaces its own errors.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept to the console deliberately: there is no error-reporting service
    // wired up yet, and silently swallowing this would make the blank-page
    // class of bug unreproducible.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        data-testid="error-boundary"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <h1 className="text-xl font-extrabold text-ink">Something went wrong on this page</h1>
        <p className="text-sm text-muted">
          The rest of the app is fine. If you were part-way through a payment, do not pay again —
          open your bookings first and check whether it already went through.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.assign('/bookings')}
            className="rounded-xl bg-blue600 px-4 py-2.5 text-sm font-bold text-white"
          >
            Go to my bookings
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border-2 border-border px-4 py-2.5 text-sm font-bold text-ink"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
