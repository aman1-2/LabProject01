import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchCartQuote } from '@pathcare/api';
import { useCart } from '../catalogue/CartContext.jsx';
import { colors, type, layout } from '../theme.js';
import { PrimaryButton, GhostButton, ScreenHeader, LoadingState, ErrorState } from '../components/ui.jsx';
import { Pressable3D, elevation } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';

/**
 * The basket.
 *
 * EVERY NUMBER HERE COMES FROM THE SERVER
 *
 * This screen computes nothing. It POSTs the slugs to /api/cart/quote and
 * renders the answer — the same endpoint the website uses, which prices a
 * basket with the very function the booking charges with. What is shown and
 * what is debited therefore cannot disagree.
 *
 * Lines show the catalogue price and the lab's effect is a single row, because
 * the server rounds ONCE over the whole basket. Multiplying each line and
 * rounding it separately produces a column that does not add up to its own
 * total — off by a rupee, which a patient cannot tell from being overcharged.
 */
const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

export default function CartScreen({ navigation }) {
  const { items, count, remove, clear } = useCart();
  const slugs = items.map((item) => item.slug);

  const quote = useQuery({
    queryKey: ['cart', 'quote', slugs.join(',')],
    queryFn: () => fetchCartQuote({ items: slugs }),
    enabled: slugs.length > 0,
    staleTime: 0,
  });

  const data = quote.data;

  return (
    <View style={layout.screen} testID="screen-cart">
      <ScreenHeader title="Your tests" onBack={navigation.goBack} />

      {count === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="flask" size={26} color={colors.blue700} strokeWidth={1.9} />
          </View>
          <Text style={styles.emptyTitle}>Nothing added yet</Text>
          <Text style={styles.emptyBody}>
            Add checkups, individual tests and scans as you browse. They are collected in one
            visit and paid for once.
          </Text>
          <PrimaryButton
            testID="btn-browse-tests"
            label="Browse tests"
            onPress={() => navigation.navigate('CatalogueTab')}
            style={styles.emptyCta}
          />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            {/* The server says which item forced a lab visit, and words it.
                A basket silently becoming a lab visit reads as a bug. */}
            {data?.modeReason ? (
              <View style={[styles.notice, styles.noticeInfo]} testID="cart-mode-notice">
                <Icon name="hospital" size={16} color={colors.blue600} strokeWidth={2.1} />
                <Text style={styles.noticeText}>{data.modeReason}</Text>
              </View>
            ) : null}

            {data?.overlapWarning ? (
              <View style={[styles.notice, styles.noticeWarn]} testID="cart-overlap-notice">
                <Icon name="alert" size={16} color={colors.amberDark} strokeWidth={2.1} />
                <Text style={styles.noticeText}>{data.overlapWarning}</Text>
              </View>
            ) : null}

            {items.map((item) => {
              // Prefer the server's line: its name and price are live, the
              // stored ones may be days old.
              const line = data?.lines?.find((l) => l.slug === item.slug);
              const name = line?.name ?? item.name;
              const category = line?.category ?? item.category;

              return (
                <View key={item.slug} style={styles.row} testID={`cart-item-${item.slug}`}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{name}</Text>
                    <View style={styles.rowMeta}>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>
                          {category === 'imaging' ? 'Scan' : category === 'package' ? 'Package' : 'Test'}
                        </Text>
                      </View>
                      <Icon name="clock" size={12} color={colors.muted} strokeWidth={2.2} />
                      <Text style={styles.rowMetaText}>
                        {line?.turnaroundHrs ?? item.turnaroundHrs} hrs
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    <Text style={styles.rowPrice}>
                      {typeof line?.basePrice === 'number' ? rupees(line.basePrice) : '—'}
                    </Text>
                    <Pressable3D
                      testID={`cart-remove-${item.slug}`}
                      onPress={() => remove(item.slug)}
                      accessibilityLabel={`Remove ${name}`}
                      style={styles.removeHit}
                      scaleTo={0.94}
                    >
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable3D>
                  </View>
                </View>
              );
            })}

            {quote.isPending ? <LoadingState label="Pricing your basket…" /> : null}

            {quote.isError ? (
              // Not knowing the price must fail loudly. Falling back to adding
              // up the stored numbers would show a figure nothing stands behind.
              <ErrorState
                message="We could not price your basket just now."
                onRetry={quote.refetch}
              />
            ) : null}

            <GhostButton testID="btn-clear-cart" label="Clear basket" onPress={clear} style={styles.clear} />
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue} testID="cart-subtotal">
                {data ? rupees(data.subtotal) : '—'}
              </Text>
            </View>

            {data?.lab && data.labAdjustment !== 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {data.labAdjustment > 0 ? 'Lab pricing' : 'Lab discount'} · {data.lab.name}
                </Text>
                <Text style={styles.summaryValue}>
                  {data.labAdjustment > 0 ? '+' : '−'}
                  {rupees(Math.abs(data.labAdjustment))}
                </Text>
              </View>
            ) : null}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {data && data.totalPending === false ? 'Total' : 'Estimated total'}
              </Text>
              <Text style={styles.totalValue} testID="cart-total">
                {data ? rupees(data.total ?? data.subtotal) : '—'}
              </Text>
            </View>

            <Text style={styles.footnote}>
              {data?.totalPendingReason ?? 'Confirmed against the live catalogue before you pay.'}
            </Text>

            <PrimaryButton
              testID="btn-cart-checkout"
              label="Choose a lab and slot"
              disabled={quote.isError}
              onPress={() => navigation.navigate('Booking', { slugs })}
              style={styles.checkout}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 16 },
  emptyBody: { ...type.bodyMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyCta: { marginTop: 22, alignSelf: 'stretch' },

  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginBottom: 14, borderWidth: 1 },
  noticeInfo: { backgroundColor: colors.blue50, borderColor: colors.blue100 },
  noticeWarn: { backgroundColor: colors.amberBg, borderColor: colors.amber },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.ink },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: 12,
    ...elevation.card,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  rowMetaText: { fontSize: 11.5, color: colors.muted },
  tag: { backgroundColor: colors.chipGreyBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 10.5, fontWeight: '800', color: colors.muted },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  rowPrice: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  removeHit: { minHeight: 32, justifyContent: 'center' },
  remove: { fontSize: 12, fontWeight: '700', color: colors.muted },

  clear: { marginTop: 4 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 6 },
  summaryLabel: { flex: 1, fontSize: 13, color: colors.muted },
  summaryValue: { fontSize: 13, fontWeight: '700', color: colors.ink },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 6,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  totalValue: { fontSize: 19, fontWeight: '800', color: colors.blue600 },
  footnote: { fontSize: 11.5, color: colors.muted, marginTop: 6, lineHeight: 17 },
  checkout: { marginTop: 14 },
});
