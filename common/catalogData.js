/**
 * Launch catalogue — Moradabad region (Uttar Pradesh).
 *
 * PROVENANCE
 *
 * Labs: the three launch sites. Coordinates are DERIVED from the Plus Code
 * recorded on each entry, not looked up and not estimated — a Plus Code is a
 * base-20 encoding of a coordinate pair, so decoding one is arithmetic with an
 * exact answer. `plusCode` is kept alongside `geo` so anyone can re-derive the
 * coordinates and check them (see backend/src/utils/openLocationCode.js, and
 * the assertion in seedCatalogue.js which fails the seed if the two disagree).
 * Address strings are reverse-geocoded from those coordinates via Nominatim.
 *
 * Tests and packages: names, prices and parameter counts are factual data
 * points taken from Orange Health Labs' public listing. Descriptions here are
 * written from clinical fact and are NOT their copy.
 *
 * PRICES NEED A LOCAL REVIEW BEFORE LAUNCH. The source list is priced for
 * Bangalore/Delhi/Mumbai. Moradabad, Rampur and Daulara are not those markets,
 * and a tier-1 metro price carried across unchanged is a commercial decision
 * nobody has actually taken.
 */

// ─────────────────────────────────────────────────────────────────────────
// Labs
// ─────────────────────────────────────────────────────────────────────────
export const REAL_LABS = [
  {
    name: 'United Moradabad',
    area: 'Moradabad',
    plusCode: '7JWWRQHF+HGQ', // short form on site signage: RQHF+HGQ
    address: 'Moradabad, Uttar Pradesh 244001, India',
    geo: { type: 'Point', coordinates: [78.773859, 28.828962] },
    serviceAreaPincodes: ['244001'],
    priceMultiplier: 1.0,
    turnaroundHrs: 6,
    isVerified: true,
    isOwned: false,
  },
  {
    name: 'Public Hospital Rampur',
    area: 'Rampur',
    plusCode: '7JWXQ2X5+RM', // short form: Q2X5+RM
    address: 'Rampur, Uttar Pradesh 244901, India',
    geo: { type: 'Point', coordinates: [79.009187, 28.799562] },
    serviceAreaPincodes: ['244901'],
    priceMultiplier: 1.0,
    turnaroundHrs: 6,
    isVerified: true,
    isOwned: false,
  },
  {
    name: 'Rajkiran Hospital',
    area: 'Daulara',
    plusCode: '7JWWRV8X+2Q', // short form: RV8X+2Q
    address: 'NH9, Niyamatpur, Moradabad, Uttar Pradesh 244926, India',
    geo: { type: 'Point', coordinates: [78.899437, 28.815062] },
    serviceAreaPincodes: ['244926'],
    priceMultiplier: 1.0,
    turnaroundHrs: 6,
    isVerified: true,
    isOwned: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Health checkup packages
// ─────────────────────────────────────────────────────────────────────────
const PACKAGES = [
  {
    name: 'Full Body Checkup - Essential',
    slug: 'full-body-checkup-essential',
    basePrice: 1599,
    strikePrice: 5243,
    parametersCount: 92,
    turnaroundHrs: 6,
    fasting: true,
    isPopular: true,
    description:
      'An annual baseline across blood counts, blood sugar, thyroid, liver, kidney and lipids — the panel that establishes what "normal" looks like for you before anything is wrong.',
    tags: ['annual', 'wellness', 'screening'],
  },
  {
    name: 'Full Body Checkup - Complete',
    slug: 'full-body-checkup-complete',
    basePrice: 4999,
    strikePrice: 18588,
    parametersCount: 117,
    turnaroundHrs: 12,
    fasting: true,
    description:
      'Extends the essential panel with vitamin, iron and inflammatory markers, for a fuller picture when symptoms are vague or a baseline has drifted.',
    tags: ['annual', 'wellness', 'vitamins'],
  },
  {
    name: 'Ultra Full Body Checkup - Male',
    slug: 'ultra-full-body-checkup-male',
    basePrice: 14999,
    strikePrice: 42729,
    parametersCount: 135,
    turnaroundHrs: 24,
    fasting: true,
    description:
      'The widest screen offered for men, adding hormone and prostate markers to the complete panel.',
    tags: ['annual', 'men', 'comprehensive'],
  },
  {
    name: 'Ultra Full Body Checkup - Female',
    slug: 'ultra-full-body-checkup-female',
    basePrice: 14999,
    strikePrice: 45529,
    parametersCount: 140,
    turnaroundHrs: 24,
    fasting: true,
    description:
      'The widest screen offered for women, adding hormone, iron-store and bone-health markers to the complete panel.',
    tags: ['annual', 'women', 'comprehensive'],
  },
  {
    name: 'Women Health Checkup - Essential',
    slug: 'women-health-checkup-essential',
    basePrice: 1599,
    strikePrice: 5563,
    parametersCount: 71,
    turnaroundHrs: 6,
    fasting: true,
    isPopular: true,
    description:
      'A first-line panel for women covering blood counts, thyroid, iron stores and vitamin D — the deficiencies that most often explain fatigue.',
    tags: ['women', 'wellness', 'thyroid'],
  },
  {
    name: 'Women Health Checkup - Advanced',
    slug: 'women-health-checkup-advanced',
    basePrice: 2699,
    strikePrice: 11013,
    parametersCount: 97,
    turnaroundHrs: 12,
    fasting: true,
    description:
      'Adds hormone and metabolic markers to the essential women’s panel, for cycle irregularity, unexplained weight change or planning a pregnancy.',
    tags: ['women', 'hormones'],
  },
  {
    name: 'Women Health Checkup - Comprehensive',
    slug: 'women-health-checkup-comprehensive',
    basePrice: 3799,
    strikePrice: 14563,
    parametersCount: 100,
    turnaroundHrs: 24,
    fasting: true,
    description:
      'The fullest women’s panel, combining the advanced hormone workup with a broad organ-function and nutritional screen.',
    tags: ['women', 'comprehensive'],
  },
  {
    name: 'PCOD Screening',
    slug: 'pcod-screening',
    basePrice: 1499,
    strikePrice: 3849,
    parametersCount: 35,
    turnaroundHrs: 12,
    fasting: true,
    description:
      'Targets the hormonal and metabolic pattern behind polycystic ovarian disease — androgens, insulin resistance and thyroid, read together rather than one at a time.',
    tags: ['women', 'hormones', 'pcod'],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Individual tests
//
// `turnaroundHrs` marked ESTIMATED below: the source listed a calendar date
// rather than a duration, so the number here is the standard processing time
// for that assay. Confirm with each lab before launch.
// ─────────────────────────────────────────────────────────────────────────
const TESTS = [
  { name: 'Glycosylated Haemoglobin (HbA1c)', slug: 'hba1c', basePrice: 440, strikePrice: 500, turnaroundHrs: 6,
    description: 'Average blood sugar over the previous two to three months — unaffected by what you ate this morning, which is why it is the standard for diagnosing and tracking diabetes.',
    tags: ['diabetes', 'sugar'], isPopular: true,
    parameters: ["Glycated Hemoglobin (HbA1c)", "Average Estimated Glucose (eAG)"],
    parametersCount: 2 },
  { name: 'Thyroid Function Test (TFT)', slug: 'thyroid-function-test-tft', basePrice: 490, strikePrice: 560, turnaroundHrs: 6,
    description: 'T3, T4 and TSH together, showing whether the thyroid is under- or over-active. Common first test for fatigue, weight change or hair loss.',
    tags: ['thyroid', 'fatigue'], isPopular: true,
    parameters: ["Total T3", "Total T4", "TSH (Ultrasensitive)"],
    parametersCount: 3 },
  { name: 'Vitamin B12', slug: 'vitamin-b12', basePrice: 990, strikePrice: 1400, turnaroundHrs: 6,
    description: 'Measures B12, a deficiency of which causes tiredness, pins and needles, and — if left long enough — nerve damage. Widespread on vegetarian diets.',
    tags: ['vitamins', 'fatigue'],
    parameters: ["Vitamin B12 Serum"],
    parametersCount: 1 },
  { name: 'Vitamin D, Total', slug: 'vitamin-d-total', basePrice: 990, strikePrice: 1500, turnaroundHrs: 6,
    description: 'Total 25-hydroxy vitamin D, the marker for bone and muscle health. Low results are common even in sunny climates, largely from indoor work.',
    tags: ['vitamins', 'bone'], isPopular: true,
    parameters: ["25-Hydroxy Vitamin D Total"],
    parametersCount: 1 },
  { name: 'Flu & Covid Fever Panel', slug: 'flu-covid-fever-panel', basePrice: 4999, strikePrice: 5050, turnaroundHrs: 48,
    sampleType: 'Swab', description: 'Distinguishes influenza from COVID-19 from a single respiratory swab, when the symptoms alone cannot. Turnaround is ESTIMATED.',
    tags: ['fever', 'infection', 'covid'] },
  { name: 'Dengue Screening', slug: 'dengue-screening', basePrice: 2199, strikePrice: 2820, turnaroundHrs: 16,
    description: 'NS1 antigen with IgM and IgG antibodies, which together separate a current dengue infection from a past one.',
    tags: ['fever', 'infection', 'dengue'] },
  { name: 'Fever Profile for Malaria', slug: 'fever-profile-malaria', basePrice: 499, strikePrice: 950, turnaroundHrs: 6,
    description: 'Screens for malarial parasites alongside a blood count, the standard workup for a fever with chills.',
    tags: ['fever', 'infection', 'malaria'] },
  { name: 'Fever Profile - Comprehensive', slug: 'fever-profile-comprehensive', basePrice: 1999, strikePrice: 5470, turnaroundHrs: 48,
    description: 'Covers the common causes of a persistent fever — malaria, dengue, typhoid and urinary infection — in one draw instead of four visits. Turnaround is ESTIMATED.',
    tags: ['fever', 'infection'] },
  { name: 'Urine Complete Analysis', slug: 'urine-complete-analysis', basePrice: 180, strikePrice: 271, turnaroundHrs: 6,
    sampleType: 'Urine', description: 'Physical, chemical and microscopic examination of urine. Picks up infection, blood, protein and sugar that point to kidney or bladder problems.',
    tags: ['kidney', 'urine', 'infection'],
    parameters: ["Color", "pH", "Specific Gravity", "Protein", "Glucose", "Ketones", "Pus Cells", "RBCs", "Epithelial Cells", "Crystals", "Bacteria"],
    parametersCount: 11 },
  { name: 'Urine Culture & Sensitivity', slug: 'urine-culture-sensitivity', basePrice: 810, strikePrice: 836, turnaroundHrs: 72,
    sampleType: 'Urine', description: 'Grows any bacteria present and tests which antibiotics kill it, so treatment is chosen on evidence rather than guesswork. Culture takes days by nature; turnaround is ESTIMATED.',
    tags: ['infection', 'urine', 'antibiotics'] },
  { name: 'Uric Acid', slug: 'uric-acid', basePrice: 180, strikePrice: 239, turnaroundHrs: 6,
    description: 'High uric acid crystallises in joints and causes gout, and burdens the kidneys. Usual test for a suddenly painful big toe.',
    tags: ['joints', 'gout', 'kidney'] },
  { name: 'Microalbumin Creatinine Ratio, Urine', slug: 'microalbumin-creatinine-ratio-urine', basePrice: 700, strikePrice: 800, turnaroundHrs: 6,
    sampleType: 'Urine', description: 'Detects very small amounts of protein leaking into urine — the earliest sign of kidney damage from diabetes or high blood pressure, well before symptoms.',
    tags: ['kidney', 'diabetes'] },
  { name: 'Liver Function Test (LFT)', slug: 'liver-function-test-lft', basePrice: 800, strikePrice: 920, turnaroundHrs: 6,
    description: 'Enzymes, bilirubin and proteins that together show how well the liver is working and whether its cells are being damaged.',
    tags: ['liver'], isPopular: true,
    parameters: ["Bilirubin Total", "Bilirubin Direct", "SGOT / AST", "SGPT / ALT", "Alkaline Phosphatase", "Total Protein", "Albumin", "Globulin", "A/G Ratio"],
    parametersCount: 9 },
  { name: 'Alanine Amino Transferase (ALT/SGPT)', slug: 'alt-sgpt', basePrice: 190, strikePrice: 280, turnaroundHrs: 6,
    description: 'A single liver enzyme that rises when liver cells are injured. Often ordered on its own to recheck an abnormal result.',
    tags: ['liver'] },
  { name: 'Aspartate Amino Transferase (AST/SGOT)', slug: 'ast-sgot', basePrice: 190, strikePrice: 290, turnaroundHrs: 6,
    description: 'A liver and muscle enzyme, read next to ALT — the ratio between the two suggests where the damage is coming from.',
    tags: ['liver'] },
  { name: 'HBsAg (CLIA)', slug: 'hbsag-clia', basePrice: 940, strikePrice: 1181, turnaroundHrs: 12,
    description: 'Hepatitis B surface antigen by chemiluminescence. A positive result means an active hepatitis B infection.',
    tags: ['liver', 'infection', 'hepatitis'] },
  { name: 'Lipid Profile', slug: 'lipid-profile', basePrice: 600, strikePrice: 690, turnaroundHrs: 6, fasting: true,
    description: 'Total, LDL and HDL cholesterol with triglycerides — the standard measure of cardiovascular risk.',
    tags: ['heart', 'cholesterol'], isPopular: true,
    parameters: ["Total Cholesterol", "Triglycerides", "HDL Cholesterol", "LDL Cholesterol", "VLDL Cholesterol", "Chol/HDL Ratio"],
    parametersCount: 6 },
  { name: 'Cholesterol Total', slug: 'cholesterol-total', basePrice: 210, strikePrice: 241, turnaroundHrs: 6, fasting: true,
    description: 'Total cholesterol alone, without the LDL and HDL breakdown. Useful for rechecking a known figure, not for a first assessment.',
    tags: ['heart', 'cholesterol'] },
  { name: 'High Sensitive C-Reactive Protein (HSCRP)', slug: 'hscrp', basePrice: 800, strikePrice: 996, turnaroundHrs: 12,
    description: 'Detects low-grade inflammation in blood vessels at levels an ordinary CRP test misses. Used alongside cholesterol to refine heart risk.',
    tags: ['heart', 'inflammation'] },
  { name: 'Lipoprotein (a)', slug: 'lipoprotein-a', basePrice: 1000, strikePrice: 1150, turnaroundHrs: 24,
    description: 'An inherited cholesterol particle that raises heart risk independently of diet. Largely fixed for life, so it is measured once rather than tracked. Turnaround is ESTIMATED.',
    tags: ['heart', 'cholesterol', 'genetic'] },
];

const FASTING = 'Fast for 10-12 hours. Water is fine.';
const NO_FASTING = 'No fasting required.';

export const REAL_TESTS = [
  ...PACKAGES.map((p) => ({
    name: p.name,
    slug: p.slug,
    category: 'package',
    sampleType: 'Blood',
    homeCollectionAvailable: true,
    basePrice: p.basePrice,
    strikePrice: p.strikePrice,
    turnaroundHrs: p.turnaroundHrs,
    ...(p.parameters?.length
      ? { parameters: p.parameters, parametersCount: p.parameters.length }
      : {}),
    prepInstructions: p.fasting ? FASTING : NO_FASTING,
    description: p.description,
    isPopular: Boolean(p.isPopular),
    tags: p.tags,
  })),
  ...TESTS.map((t) => ({
    name: t.name,
    slug: t.slug,
    category: 'single',
    sampleType: t.sampleType ?? 'Blood',
    homeCollectionAvailable: true,
    basePrice: t.basePrice,
    strikePrice: t.strikePrice,
    turnaroundHrs: t.turnaroundHrs,
    prepInstructions: t.fasting ? FASTING : NO_FASTING,
    description: t.description,
    isPopular: Boolean(t.isPopular),
    tags: t.tags,
    // The panel contents. Both are omitted when unknown rather than sent as an
    // empty array with a count beside it — the UI counts the list it can show,
    // so a count without a list would be a claim nothing backs up.
    ...(t.parameters?.length
      ? { parameters: t.parameters, parametersCount: t.parameters.length }
      : {}),
  })),
];

export default { REAL_TESTS, REAL_LABS };
