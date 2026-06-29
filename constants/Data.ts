import type { Player, Friend, Game, Thread } from '@/types';

export const VENUES = [
  // Lahore
  'Lahore Gymkhana',
  'Defence Raya Golf & Country Club',
  'Lahore Garrison Golf & Country Club',
  'Royal Palm Golf and Country Club',
  'PAF Skyview GC',
  // Islamabad / Rawalpindi
  'Islamabad Golf Club',
  'Rawalpindi Golf Club',
  'Margalla Greens Golf Club',
  'PAF Golf Club Islamabad',
  // Karachi
  'Karachi Golf Club',
  'DHA Golf Club',
  'Airmen Golf Club & Recreational Park',
  // Multan
  'Rumanza Golf & Country Club',
  'Multan Golf Club',
];

/** Courses available per city (matches the CITIES list in profile-setup). */
export const VENUES_BY_CITY: Record<string, string[]> = {
  'Lahore': [
    'Lahore Gymkhana',
    'Defence Raya Golf & Country Club',
    'Lahore Garrison Golf & Country Club',
    'Royal Palm Golf and Country Club',
    'PAF Skyview GC',
  ],
  'Islamabad / Rawalpindi': [
    'Islamabad Golf Club',
    'Rawalpindi Golf Club',
    'Margalla Greens Golf Club',
    'PAF Golf Club Islamabad',
  ],
  'Karachi': [
    'Karachi Golf Club',
    'DHA Golf Club',
    'Airmen Golf Club & Recreational Park',
  ],
  'Multan': [
    'Rumanza Golf & Country Club',
    'Multan Golf Club',
  ],
};

/** Returns courses for the given city, or all VENUES if city is unknown/unset. */
export function getVenuesForCity(city: string): string[] {
  return VENUES_BY_CITY[city] ?? VENUES;
}

export const PLAYERS: Player[] = [
  {
    id: 'ali', who: 'ali', name: 'Ali K.', rating: 4.9,
    home: 'Lahore Gymkhana', homePro: 'Lahore Gymkhana · Defence Raya Golf & Country Club',
    hcp: 'Hcp 9', tees: 'Blue', pace: 'Moderate', cart: 'Walking', music: 'Yes',
    online: true, distance: '2 km',
    bio: 'Single-digit at Lahore Gymkhana, scratch-adjacent on a good day. Fast walker, zero drama, always down for post-round chai.',
  },
  {
    id: 'hassan', who: 'hassan', name: 'Hassan R.', rating: 4.6,
    home: 'Defence Raya Golf & Country Club', homePro: 'Defence Raya Golf & Country Club',
    hcp: 'Hcp 12', tees: 'Blue', pace: 'Moderate', cart: 'Walking', music: 'Any',
    online: true, distance: '5 km',
    bio: 'DHA Raya regular. Clean ball-striker who counts every shot. Happy to set pace for any group.',
  },
  {
    id: 'ayesha', who: 'ayesha', name: 'Ayesha M.', rating: 4.7,
    home: 'Royal Palm Golf and Country Club', homePro: 'Royal Palm Golf and Country Club · Lahore Gymkhana',
    hcp: 'Hcp 18', tees: 'Red', pace: 'Relaxed', cart: 'Cart', music: 'No music',
    online: false, distance: '8 km',
    bio: 'Royal Palm member juggling golf with everything else. Relaxed round, great company, absolutely no rush.',
  },
  {
    id: 'faisal', who: 'faisal', name: 'Faisal S.', rating: 4.4,
    home: 'Karachi Golf Club', homePro: 'Karachi Golf Club',
    hcp: 'Hcp 22', tees: 'Yellow', pace: 'Casual', cart: 'Cart', music: 'Yes',
    online: true, distance: 'Karachi · Pro reach',
    bio: 'Based in Karachi, up in Lahore regularly for work. Casual round, friendly wager, good chat.',
  },
];

export const FRIENDS: Friend[] = [
  { id: 'ali',    who: 'ali',    name: 'Ali K.',    hcp: 'Hcp 9',  home: 'Lahore Gymkhana', online: true,  games: 7, tees: 'Blue' },
  { id: 'hassan', who: 'hassan', name: 'Hassan R.', hcp: 'Hcp 12', home: 'Defence Raya Golf & Country Club',        online: true,  games: 4, tees: 'Blue' },
  { id: 'ayesha', who: 'ayesha', name: 'Ayesha M.', hcp: 'Hcp 18', home: 'Royal Palm Golf and Country Club',    online: false, games: 2, tees: 'Red'  },
  {
    id: 'omar', who: 'omar', name: 'Omar T.', hcp: 'Hcp 14',
    home: 'Lahore Gymkhana', homePro: 'Lahore Gymkhana', rating: 4.5,
    tees: 'Blue', pace: 'Moderate', cart: 'Walking', music: 'Any',
    online: true, games: 3, distance: '4 km',
    bio: 'Gymkhana regular with a reliable mid-iron game. Good for early mornings before the workday starts.',
  },
  {
    id: 'zara', who: 'zara', name: 'Zara S.', hcp: 'Hcp 22',
    home: 'Defence Raya Golf & Country Club', homePro: 'Defence Raya Golf & Country Club', rating: 4.3,
    tees: 'Red', pace: 'Relaxed', cart: 'Cart', music: 'Yes',
    online: false, games: 1, distance: '6 km',
    bio: "DHA Raya member. Social round player — loves the walk, the chat, and the 19th hole equally.",
  },
];

// Players not in FRIENDS — shown as suggestions
export const SUGGESTED_PLAYERS = PLAYERS.filter(
  p => !FRIENDS.find(f => f.id === p.id)
);

export const GAMES: Game[] = [
  {
    id: 'g1', title: 'Threesome needs a 4th', venue: 'Lahore Gymkhana', city: 'Lahore',
    when: 'Tomorrow 2pm', crew: ['omar', 'zara', 'bilal'],
    crewNames: 'Omar, Zara, Bilal', crewRating: '4.1',
    chips: [['brand', 'Hcp 12–18'], ['gray', 'Moderate']],
    spots: 1, boosted: false,
    tees: 'Blue', cart: 'Walking', holes: '18 Holes', format: 'Stroke Play',
  },
  {
    id: 'g2', title: 'Saturday morning round', venue: 'Defence Raya Golf & Country Club', city: 'Lahore',
    when: 'Sat 7am', crew: ['hassan', 'ayesha'],
    crewNames: 'Hassan, Ayesha', crewRating: '4.7',
    chips: [['brand', 'Hcp 12–18'], ['gray', 'Relaxed'], ['gray', 'Stableford']],
    spots: 2, boosted: false,
    tees: 'Blue', cart: 'Any', holes: '18 Holes', format: 'Stableford',
  },
  {
    id: 'g3', title: 'Twilight 9 holes', venue: 'Royal Palm Golf and Country Club', city: 'Lahore',
    when: 'Today 6pm', crew: ['ali'],
    crewNames: 'Ali K.', crewRating: '4.9',
    chips: [['brand', 'Hcp 6–12'], ['gray', 'Fast'], ['gray', '9 Holes'], ['green', 'Music OK']],
    spots: 3, boosted: false,
    tees: 'Any', cart: 'Walking', holes: '9 Holes', format: 'Stroke Play',
  },
  {
    id: 'g4', title: 'Solo — looking for company', venue: 'Lahore Garrison Golf & Country Club', city: 'Lahore',
    when: 'Sun 8am', crew: ['faisal'],
    crewNames: 'Faisal S.', crewRating: '4.4',
    chips: [['brand', 'Hcp 18–24'], ['gray', 'Casual'], ['gray', 'Match Play']],
    spots: 3, boosted: false,
    tees: 'Yellow', cart: 'Cart', holes: '18 Holes', format: 'Match Play',
  },
];

export const THREADS: Thread[] = [
  {
    id: 'ali', who: 'ali', name: 'Ali K.',
    last: 'See you at 7 — I\'ll be on the first tee', time: '9:41 AM', unread: 2,
    msgs: [
      { from: 'ali',  text: 'Hey, still on for Saturday?', time: '9:30 AM' },
      { from: 'me',   text: 'Absolutely! Gymkhana at 7?', time: '9:32 AM' },
      { from: 'ali',  text: 'Perfect. Bring your A-game 😄', time: '9:35 AM' },
      { from: 'me',   text: 'Ha, I\'ll bring my B-game and hope for the best', time: '9:37 AM' },
      { from: 'ali',  text: 'See you at 7 — I\'ll be on the first tee', time: '9:41 AM' },
    ],
  },
  {
    id: 'hassan', who: 'hassan', name: 'Hassan R.',
    last: 'Great round today, same time next week?', time: 'Yesterday', unread: 0,
    msgs: [
      { from: 'hassan', text: 'Great round today, same time next week?', time: 'Yesterday' },
    ],
  },
  {
    id: 'g1-thread', who: 'omar', name: 'Gymkhana Threesome',
    last: 'Omar: Confirmed, see everyone tomorrow', time: 'Tue', unread: 0,
    isGroup: true, crew: ['omar', 'zara', 'bilal'],
    msgs: [
      { from: 'omar', text: 'Confirmed, see everyone tomorrow', time: 'Tue' },
    ],
  },
];

// Avatar image indices from pravatar.cc
export const AVATAR_IDS: Record<string, number> = {
  yousef: 12,
  ali:    33,
  omar:   8,
  zara:   47,
  bilal:  11,
  hassan: 15,
  ayesha: 49,
  faisal: 68,
};
