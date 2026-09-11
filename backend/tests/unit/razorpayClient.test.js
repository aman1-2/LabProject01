import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RazorpayClient } from '../../src/utils/razorpayClient.js';

/**
 * BLOCKER #12 regression.
 *
 * createOrder and createRefund fabricated a plausible-looking gateway response
 * whenever the Razorpay API call failed, gated on
 *   `process.env.NODE_ENV === 'test' || !this.keyId.startsWith('rzp_live')`.
 *
 * The second clause meant ANY deployment on test keys — staging, or production
 * before live keys are swapped in — silently invented an `order_...` id, wrote
 * it to the payments collection and handed it to the browser. Checkout then
 * opened against an order Razorpay had never heard of: no payment taken, no
 * webhook, booking pending forever, and a Payment row indistinguishable from a
 * real one. CONTEXT §11 forbids exactly this.
 */
describe('RazorpayClient never fabricates a gateway response (BLOCKER #12)', () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_FETCH = globalThis.fetch;

  function makeClient(keyId = 'rzp_test_something') {
    return new RazorpayClient({
      keyId,
      keySecret: 'secret_value',
      webhookSecret: 'webhook_value',
    });
  }

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  describe('createOrder', () => {
    it('throws when the gateway returns a non-2xx, even on test keys', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => 'Authentication failed',
      });

      const client = makeClient('rzp_test_pathcare_key');

      await expect(
        client.createOrder({ amountPaise: 29900, receipt: 'booking123' })
      ).rejects.toThrow(/Razorpay Order Creation Failed/);
    });

    it('throws when the gateway is unreachable, even with NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      globalThis.fetch = async () => {
        throw new Error('getaddrinfo ENOTFOUND api.razorpay.com');
      };

      const client = makeClient('rzp_test_pathcare_key');

      await expect(
        client.createOrder({ amountPaise: 29900, receipt: 'booking123' })
      ).rejects.toThrow(/ENOTFOUND/);
    });

    it('never returns a synthetic order id', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'upstream error',
      });

      const client = makeClient('rzp_test_pathcare_key');

      let result = null;
      try {
        result = await client.createOrder({ amountPaise: 1000, receipt: 'b1' });
      } catch {
        // expected
      }

      expect(result).toBeNull();
    });

    it('returns the real gateway payload on success', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ id: 'order_real_from_gateway', amount: 29900 }),
      });

      const client = makeClient();
      const order = await client.createOrder({ amountPaise: 29900, receipt: 'b1' });

      expect(order.id).toBe('order_real_from_gateway');
    });
  });

  describe('createRefund', () => {
    it('throws when the gateway rejects the refund, even with NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => 'The refund amount exceeds the captured amount',
      });

      const client = makeClient('rzp_test_pathcare_key');

      await expect(
        client.createRefund({ paymentId: 'pay_1', amountPaise: 50000 })
      ).rejects.toThrow(/Razorpay Refund Failed/);
    });

    it('throws when the gateway is unreachable', async () => {
      globalThis.fetch = async () => {
        throw new Error('socket hang up');
      };

      const client = makeClient('rzp_test_pathcare_key');

      await expect(
        client.createRefund({ paymentId: 'pay_1', amountPaise: 1000 })
      ).rejects.toThrow(/socket hang up/);
    });

    it('never returns a synthetic refund id', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'upstream error',
      });

      const client = makeClient('rzp_test_pathcare_key');

      let result = null;
      try {
        result = await client.createRefund({ paymentId: 'pay_1', amountPaise: 1000 });
      } catch {
        // expected
      }

      expect(result).toBeNull();
    });
  });

  describe('no fabrication code remains in source', () => {
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const CLIENT = path.resolve(HERE, '../../src/utils/razorpayClient.js');

    it('contains no synthetic order_/rfnd_ id generation', () => {
      const contents = fs.readFileSync(CLIENT, 'utf8');

      expect(contents).not.toMatch(/`order_\$\{/);
      expect(contents).not.toMatch(/`rfnd_\$\{/);
    });

    it('does not branch on NODE_ENV or on the key being non-live', () => {
      const contents = fs.readFileSync(CLIENT, 'utf8');

      // Either branch previously enabled the fabrication.
      expect(contents).not.toContain('rzp_live');
      expect(contents).not.toMatch(/NODE_ENV\s*===\s*'test'/);
    });
  });
});
