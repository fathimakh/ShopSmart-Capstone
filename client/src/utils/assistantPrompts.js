// The questions the shop offers as examples, kept in one place so a test can ask each
// of them of the seeded catalogue the way the on-device parser would, and make sure none
// of them comes back empty when the shopper clicks it.

/** Starters on the assistant page. */
export const ASSISTANT_OPENERS = [
  'wireless headphones under $50 rated above 4',
  'my phone screen keeps cracking, what should I get',
  'gift for my wife who loves perfume, up to 150',
  'best rated laptop for college, budget around 1400'
]

/** Follow-ups the assistant offers under an answer. */
export const ASSISTANT_FOLLOW_UPS = ['show cheaper options', 'only the top rated ones', 'what about newest arrivals']

/** Examples under the AI search box on the shop page, asked of the assistant. */
export const SEARCH_EXAMPLES = [
  'wireless headphones under $50 rated above 4',
  'cheapest samsung smartphone',
  'top rated laptops around $1200',
  'womens bags on sale'
]
