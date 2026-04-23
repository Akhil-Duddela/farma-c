/**
 * Farm / poultry–focused, deterministic content intelligence (no LLM call required).
 * Used when you need fast, reliable tips even if external AI is down.
 */
const TRENDING = [
  {
    id: 'bio-layer-nutrition',
    title: 'Layer hen nutrition: calcium, phosphorus balance',
    summary: 'Tweak feed phases to reduce hairline shell cracks in peak lay.',
  },
  {
    id: 'rbi-meat-quality',
    title: 'RBI in broiler finishing',
    summary: 'Short, digestible take on how density and light affect carcass quality.',
  },
  {
    id: 'disease-prevention',
    title: 'Respiratory season — ventilation checklist',
    summary: 'Ammonia control and min vent rules that scale from 1k to 20k head.',
  },
  {
    id: 'hatchery-hygiene',
    title: 'Hatchery: dip vs spray disinfection',
    summary: 'When to use each, and how to log batch traceability for audits.',
  },
  {
    id: 'water-quality',
    title: 'TDS, ORP, and drinker line biofilm',
    summary: 'Simple on-farm water tests and cleaning cadence for nipple systems.',
  },
];

const HASHTAG_POOLS = {
  en: [
    'poultry',
    'farming',
    'backyardchickens',
    'desifarming',
    'poultryfarming',
    'broiler',
    'layerfarming',
    'indianfarmer',
    'agripreneur',
    'livestock',
    'sustainablefarming',
    'veterinary',
    'animalhusbandry',
  ],
  hi: ['poultryfarming', 'deshi_murgi', 'farmingindia', 'kisan', 'dairy', 'farming', 'kheti', 'bharat', 'deshi'],
};

/**
 * Suggested caption starters (user fills in the middle).
 * @param {string} [locale]
 * @returns {string[]}
 */
function suggestedCaptions(locale = 'en') {
  const pool = [
    "Today's barn walk: {highlight}. What's one thing you'd fix first? 👇",
    "Quick tip for {audience}: {action}. Try this on your next check.",
    "Honest take from the field: {opinion} — not advice, just what we saw.",
  ];
  if (locale && locale.startsWith('hi')) {
    return [
      'Aaj ke farm check par: {point}. Aapke yahan kya strategy hai?',
      'Sachchi baat, seedha: {opinion} — aap bhi share karein.',
    ];
  }
  return pool;
}

/**
 * @param {string} timezone
 * @returns {object} Best posting time recommendation (local wall clock)
 */
function bestPostingTime(timezone = 'Asia/Kolkata') {
  // Engagement-weighted: morning + evening; India-centric defaults
  const isIndia = (timezone || '').toLowerCase().includes('kolkata') || (timezone || '').toLowerCase().includes('india');
  if (isIndia) {
    return {
      primaryLocal: '19:00–20:30',
      secondaryLocal: '07:30–09:00',
      days: ['Tuesday', 'Thursday', 'Saturday'],
      rationale: 'Evening slots align with off-work scroll time; keep Shorts and Reels under 45s in feed.',
    };
  }
  return {
    primaryLocal: '18:00–20:00',
    secondaryLocal: '08:00–10:00',
    days: ['Weekdays'],
    rationale: 'Stagger posts; avoid 01:00–05:00 local except for scheduled test batches.',
  };
}

/**
 * @param {object} opts
 * @param {string} [opts.timezone]
 * @param {string} [opts.locale]
 */
function getRecommendations({ timezone, locale } = {}) {
  const tags = (locale && locale.startsWith('hi') ? HASHTAG_POOLS.hi : HASHTAG_POOLS.en)
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return {
    trending: TRENDING.slice(0, 4),
    suggestedCaptions: suggestedCaptions(locale),
    suggestedHashtags: tags,
    bestPostingTime: bestPostingTime(timezone || 'Asia/Kolkata'),
    asOf: new Date().toISOString(),
  };
}

module.exports = { getRecommendations, TRENDING, bestPostingTime };
