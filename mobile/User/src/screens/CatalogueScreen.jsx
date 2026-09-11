import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATALOGUE_SECTIONS } from '@pathcare/api';
import { loadCatalogue } from '../catalogue/loadCatalogue.js';
import { colors, type, card, chip, input, layout } from '../theme.js';
import { Banner, EmptyState, ErrorState } from '../components/ui.jsx';
import { Pressable3D, SkeletonList, FadeInView, elevation } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';
import { useCart } from '../catalogue/CartContext.jsx';
import { formatCurrency } from '../lib/format.js';

/**
 * Tests & Packages, transcribed from the prototype's #screen-testcatalog:
 * horizontal-scrolling filter chips (never wrapping, per §5) over full-width cards.
 *
 * The list is bundled-first: the pre-bundled catalogue paints immediately so a
 * cold first launch is never blank (§7.3), then revalidates from the API. When
 * revalidation fails the bundled data stays on screen behind an honest banner
 * rather than being replaced by an error.
 */
const FILTERS = [{ key: 'all', label: 'All' }, ...CATALOGUE_SECTIONS];

export default function CatalogueScreen({ navigation, route }) {
  const { add, has, count, indicativeTotal } = useCart();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState(route?.params?.search ?? '');
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  // A category tap from Home arrives as a route param.
  useEffect(() => {
    if (route?.params?.search !== undefined) setSearch(route.params.search);
  }, [route?.params?.search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadCatalogue({
      category,
      search,
      onUpdate: (next) => {
        if (!cancelled) setPayload(next);
      },
    })
      .then((final) => {
        if (!cancelled && final.revalidationFailed) setError(final.error);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [category, search]);

  const isStale = payload?.isStale ?? false;

  // Derived inside the memo: a fresh [] literal on every render would make the
  // dependency change every time and defeat the memo entirely.
  const grouped = useMemo(() => {
    const items = payload?.items ?? [];
    if (category !== 'all') return [{ key: category, label: null, items }];
    // DESIGN_SPEC §3.4 section order.
    return CATALOGUE_SECTIONS.map((section) => ({
      key: section.key,
      label: section.label,
      items: items.filter((item) => item.category === section.key),
    })).filter((section) => section.items.length > 0);
  }, [payload, category]);

  const items = payload?.items ?? [];

  return (
    <View style={layout.screen} testID="screen-catalogue">
      <View style={styles.header}>
        <Text style={styles.title}>Tests & Packages</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="input-search"
          style={input.base}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tests, packages…"
          placeholderTextColor={colors.muted2}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* §5: filter chips scroll horizontally, never wrap. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {FILTERS.map((filter) => {
          const active = category === filter.key;
          return (
            <Pressable
              key={filter.key}
              testID={`filter-${filter.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(filter.key)}
              style={[chip.base, active ? chip.blue : chip.grey, styles.chipTouch]}
            >
              <Text style={[chip.label, active ? chip.labelBlue : chip.labelGrey]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isStale ? (
        <Banner
          testID="banner-offline-catalogue"
          tone="amber"
          text="Showing the catalogue bundled with the app. Prices are confirmed before you pay."
        />
      ) : null}

      <ScrollView contentContainerStyle={styles.body}>
        {payload === null ? <SkeletonList count={4} /> : null}

        {payload !== null && items.length === 0 && !error ? (
          <EmptyState
            testID="empty-catalogue"
            icon="search"
            title={search ? 'No tests match that search' : 'No tests in this section'}
            message={
              search
                ? 'Try a different word, or clear the search to see everything available in Dehradun.'
                : 'Tests in this section will appear here as they are added to the catalogue.'
            }
          />
        ) : null}

        {error && items.length === 0 ? (
          <ErrorState
            message={
              error?.isNetworkError
                ? 'No connection, and nothing bundled for this filter.'
                : error?.message
            }
            onRetry={() => setSearch((value) => value)}
          />
        ) : null}

        {grouped.map((section) => (
          <View key={section.key}>
            {section.label ? <Text style={styles.sectionLabel}>{section.label}</Text> : null}
            {section.items.map((item, index) => (
              <FadeInView key={item.slug} delay={Math.min(index * 40, 200)}>
                <TestCard
                  item={item}
                  inCart={has(item.slug)}
                  onAdd={() => add(item)}
                  onPress={() => navigation.navigate('TestDetail', { slug: item.slug })}
                />
              </FadeInView>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* The basket bar. On a phone the header scrolls away immediately, and a
          basket you cannot see is a basket you forget. */}
      {count > 0 ? (
        <View style={styles.basketBar} testID="catalogue-basket-bar">
          <View style={styles.basketText}>
            <Text style={styles.basketCount}>
              {count} {count === 1 ? 'item' : 'items'} added
            </Text>
            <Text style={styles.basketHint}>
              {formatCurrency(indicativeTotal)} indicative · final price at checkout
            </Text>
          </View>
          <Pressable3D
            testID="btn-view-basket"
            accessibilityLabel="View your basket"
            onPress={() => navigation.navigate('Cart')}
            style={styles.basketCta}
            scaleTo={0.97}
          >
            <Text style={styles.basketCtaText}>View basket</Text>
          </Pressable3D>
        </View>
      ) : null}
    </View>
  );
}

function TestCard({ item, onPress, onAdd, inCart }) {
  const discounted = item.strikePrice && item.strikePrice > item.basePrice;
  const percentOff = discounted
    ? Math.round(((item.strikePrice - item.basePrice) / item.strikePrice) * 100)
    : 0;

  return (
    <Pressable3D
      testID={`test-${item.slug}`}
      accessibilityLabel={item.name}
      onPress={onPress}
      style={[card.base, styles.card, elevation.card]}
    >
      {/* DESIGN_SPEC §1.1: red is the discount badge — max one per screen area. */}
      {discounted ? (
        <View style={styles.ribbon}>
          <Text style={styles.ribbonText}>{percentOff}% OFF</Text>
        </View>
      ) : null}

      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardMeta}>
        {item.parametersCount ? `${item.parametersCount} parameters · ` : ''}
        Reports in {item.turnaroundHrs} hrs
      </Text>

      <View style={styles.priceRow}>
        {discounted ? <Text style={styles.strike}>{formatCurrency(item.strikePrice)}</Text> : null}
        <Text style={styles.price}>{formatCurrency(item.basePrice)}</Text>

        {/* Adding must not also open the test — the card itself is pressable,
            so this swallows the press. */}
        <Pressable3D
          testID={`add-to-cart-${item.slug}`}
          accessibilityLabel={inCart ? `${item.name} is in your basket` : `Add ${item.name}`}
          onPress={onAdd}
          disabled={inCart}
          style={[styles.addBtn, inCart && styles.addBtnDone]}
          scaleTo={0.94}
        >
          <Icon
            name={inCart ? 'check' : 'plus'}
            size={13}
            color={inCart ? colors.green : colors.blue600}
            strokeWidth={2.6}
          />
          <Text style={[styles.addText, inCart && styles.addTextDone]}>
            {inCart ? 'Added' : 'Add'}
          </Text>
        </Pressable3D>
      </View>

      {!item.homeCollectionAvailable ? (
        <View style={styles.tagRow}>
          <Icon name="alert" size={12} color={colors.amberDark} strokeWidth={2.2} />
          <Text style={styles.labOnly}>Lab visit only</Text>
        </View>
      ) : null}

      {/* Care plans are the recurring product, so say so where they are chosen. */}
      {item.category === 'plan' ? (
        <View style={styles.tagRow}>
          <Icon name="repeat" size={12} color={colors.blue600} strokeWidth={2.2} />
          <Text style={styles.planTag}>Available as a subscription</Text>
        </View>
      ) : null}
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.blue600,
    minHeight: 36,
  },
  addBtnDone: { borderColor: colors.green, backgroundColor: colors.greenBg },
  addText: { fontSize: 12.5, fontWeight: '800', color: colors.blue600 },
  addTextDone: { color: colors.green },

  basketBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  basketText: { flex: 1 },
  basketCount: { fontSize: 14, fontWeight: '800', color: colors.ink },
  basketHint: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  basketCta: {
    backgroundColor: colors.blue600,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  basketCtaText: { color: colors.white, fontWeight: '800', fontSize: 13.5 },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  // §5 / §7: minimum 44x44 touch target — chips are the usual offender.
  chipTouch: { minHeight: 36, paddingVertical: 9, justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 96 },
  sectionLabel: {
    ...type.label,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 10,
  },
  card: { padding: 16, marginBottom: 14, overflow: 'hidden' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  planTag: { fontSize: 11.5, fontWeight: '700', color: colors.blue600 },
  ribbon: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  ribbonText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
  cardTitle: { fontWeight: '800', fontSize: 14.5, color: colors.ink, paddingRight: 70 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strike: { textDecorationLine: 'line-through', color: colors.muted2, fontSize: 12.5 },
  price: { color: colors.blue600, fontWeight: '800', fontSize: 16 },
  labOnly: { fontSize: 11.5, fontWeight: '700', color: colors.amberDark },
});
