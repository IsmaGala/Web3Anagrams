import type { World } from './worlds'
import { TOWNSTAR_LEVELS }     from './townstarLevels'
import { MIRANDUS_LEVELS }     from './mirandusLevels'
import { GALASWAP_LEVELS }     from './galaswapLevels'
import { ETERNALNIGHT_LEVELS } from './eternalnightLevels'
import { AREA51_LEVELS }       from './area51Levels'
import { AREA515_LEVELS }      from './area515Levels'
import { FLAGS_LEVELS }        from './flagsLevels'
import { ASIMOV_LEVELS }       from './asimovLevels'
import { NATURE_LEVELS }       from './natureLevels'
import { OCEAN_EVENT_LEVELS }  from './oceanEventLevels'
import { BLOOD_DONOR_LEVELS }  from './bloodDonorLevels'

export const WORLDS: World[] = [
  {
    id:          'townstar',
    name:        'Town Star',
    subtitle:    'Build, Farm & Earn',
    icon:        '🌾',
    description: 'Learn the lingo of Town Star — Gala\'s farming game where you build towns, grow crops, and earn TOWN Coin.',
    color:       '#4ade80',
    gradient:    'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
    levelCount:  TOWNSTAR_LEVELS.length,
    unlockAfter: 0,
    // First free world doubles as the on-ramp to the Gem economy. Lower
    // payout than the other three because it's also the easiest to clear.
    completionReward: 150,
    levels:      TOWNSTAR_LEVELS,
  },
  {
    id:          'mirandus',
    name:        'Mirandus',
    subtitle:    'Explore the Realm',
    icon:        '⚔️',
    description: 'Venture into the fantasy world of Mirandus — a blockchain MMORPG where land, buildings and ships are NFTs.',
    color:       '#818cf8',
    gradient:    'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #3730a3 100%)',
    levelCount:  MIRANDUS_LEVELS.length,
    unlockAfter: 5,
    completionReward: 200,
    levels:      MIRANDUS_LEVELS,
  },
  {
    id:          'galaswap',
    name:        'Gala Swap',
    subtitle:    'Master DeFi Trading',
    icon:        '🔄',
    description: 'Decode the language of decentralized trading — liquidity pools, slippage, yield and more from Gala Swap.',
    color:       '#38bdf8',
    gradient:    'linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0369a1 100%)',
    levelCount:  GALASWAP_LEVELS.length,
    unlockAfter: 5,
    completionReward: 200,
    levels:      GALASWAP_LEVELS,
  },
  {
    id:          'eternalnight',
    name:        'Eternal Night',
    subtitle:    'Survive the Dark',
    icon:        '🌑',
    description: 'Step into Mirandus: Eternal Night — a hex-based survival realm where the dark hunts you, blades dull with every strike, and the Awakened State turns the tide of battle.',
    color:       '#c084fc',
    gradient:    'linear-gradient(135deg, #0d0220 0%, #2d1b69 50%, #4c1d95 100%)',
    levelCount:  ETERNALNIGHT_LEVELS.length,
    unlockAfter: 5,
    completionReward: 200,
    levels:      ETERNALNIGHT_LEVELS,
  },
  {
    id:          'area51',
    name:        'Area 51',
    subtitle:    'UFO Lore & Black Ops',
    icon:        '🛸',
    description: 'A premium dossier of UFO lore — Roswell, hangars, abductions, motherships. Unlock with Gems to access a 10-level deep-state crescendo.',
    color:       '#22d3ee',
    gradient:    'linear-gradient(135deg, #042f2e 0%, #0e7490 50%, #155e75 100%)',
    levelCount:  AREA51_LEVELS.length,
    unlockAfter: 0,
    premium:     true,
    cost:        1200,
    levels:      AREA51_LEVELS,
  },
  {
    id:          'asimov',
    name:        'Asimov Robotics',
    subtitle:    'Three Laws & Positronic Brains',
    icon:        '🤖',
    description: 'Inspired by Isaac Asimov — I, Robot, Foundation, the Three Laws, Daneel Olivaw and the positronic brain. 20 levels through the language of robotics and AI.',
    color:       '#f472b6',
    gradient:    'linear-gradient(135deg, #500724 0%, #831843 50%, #9d174d 100%)',
    levelCount:  ASIMOV_LEVELS.length,
    unlockAfter: 0,
    premium:     true,
    cost:        2000,
    levels:      ASIMOV_LEVELS,
  },
  {
    id:          'nature',
    name:        'Peaks & Trails',
    subtitle:    'Mountains, Hiking & Climbing',
    icon:        '🏔️',
    description: 'Forty levels through the language of the high places — trails and summits, glaciers and gorges, crampons and bivouacs, all the way up to Kilimanjaro. Twice the size of a standard world.',
    color:       '#10b981',
    gradient:    'linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f766e 100%)',
    levelCount:  NATURE_LEVELS.length,
    unlockAfter: 0,
    premium:     true,
    cost:        3250,
    levels:      NATURE_LEVELS,
  },
  {
    id:          'oceanevent',
    name:        'Deep Sea',
    subtitle:    'Weekly Event',
    icon:        '🌊',
    description: 'A 10-level dive into the deep — waves, coral, sharks, krakens and the lost city of Atlantis. Unlocks for 5 Gems per week. Top the leaderboard for hint pack rewards.',
    color:       '#0ea5e9',
    gradient:    'linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0369a1 100%)',
    levelCount:  OCEAN_EVENT_LEVELS.length,
    unlockAfter: 0,
    event:       true,
    cost:        5,
    startDate:   '2026-05-25',     // TESTING: set to current week — revert to '2026-06-01' after
    eventReward: { firstPlaceSkin: 'deep-sea' },
    levels:      OCEAN_EVENT_LEVELS,
  },
  {
    // World Blood Donor Day — annual observance on June 14. Scheduled here
    // for the following Monday so it's immediately visible as the "upcoming"
    // card while Deep Sea is still active. Move startDate to '2026-06-08'
    // when you want it to align with the actual June 14 observance.
    id:          'blooddonor',
    name:        'Blood Donor Day',
    subtitle:    'Weekly Event',
    icon:        '🩸',
    description: '10 levels through the language of blood donation — veins, pulses, plasma, the people and the courage. Honors World Blood Donor Day (June 14). Unlocks for 5 Gems per week.',
    color:       '#ef4444',
    gradient:    'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
    levelCount:  BLOOD_DONOR_LEVELS.length,
    unlockAfter: 0,
    event:       true,
    cost:        5,
    startDate:   '2026-06-08',     // week of Jun 8
    eventReward: { firstPlaceSkin: 'blood' },
    levels:      BLOOD_DONOR_LEVELS,
  },
  {
    // Area 51.5 — the declassified-secondary-files event. Built from the
    // 10 themes that were trimmed when Area 51 was reduced from 20 → 10
    // levels (see area515Levels.ts header). Slotted for the week AFTER
    // Blood Donor Day so the event rotation reads Deep Sea → Blood Donor
    // Day → Area 51.5 in calendar order. Cyan accent mirrors Area 51's
    // color so players read it as "the sequel" at a glance.
    id:          'area515',
    name:        'Area 51.5',
    subtitle:    'Declassified Files',
    icon:        '🛸',
    description: '10 levels of secondary UFO files spun off from the Area 51 dossier — bunkers, beacons, telepaths, monoliths. The lore that didn\'t make the headline cut. Unlocks for 5 Gems per week.',
    color:       '#22d3ee',
    gradient:    'linear-gradient(135deg, #155e75 0%, #0e7490 50%, #042f2e 100%)',
    levelCount:  AREA515_LEVELS.length,
    unlockAfter: 0,
    event:       true,
    cost:        5,
    startDate:   '2026-06-15',     // week of Jun 15 — slot after Blood Donor Day
    eventReward: { firstPlaceSkin: 'cybernetic' },
    levels:      AREA515_LEVELS,
  },
  {
    // Flags and Countries — fourth weekly event, the "release month"
    // capstone. International scope (STARS, NATION, SPAIN, REPUBLIC,
    // CONTINENT…) with US examples sprinkled into defs where natural,
    // since the rank-1 reward is the Patriot skin (US flag palette).
    // Slotted for the week after Area 51.5 so the rotation reads:
    // Deep Sea → Blood Donor Day → Area 51.5 → Flags and Countries.
    id:          'flags',
    name:        'Flags and Countries',
    subtitle:    'Release Month Event',
    icon:        '🚩',
    description: '10 levels through the language of flags and nations — stars, eagles, anthems, capitals, republics. From Old Glory to the continents.',
    color:       '#dc2626',
    gradient:    'linear-gradient(135deg, #1e3a8a 0%, #7f1d1d 50%, #0c1d3d 100%)',
    levelCount:  FLAGS_LEVELS.length,
    unlockAfter: 0,
    event:       true,
    cost:        5,
    startDate:   '2026-06-22',     // week of Jun 22 — slot after Area 51.5
    eventReward: { firstPlaceSkin: 'patriot' },
    levels:      FLAGS_LEVELS,
  },
  {
    id:          'coming_soon',
    name:        'Coming Soon',
    subtitle:    'New World Incoming',
    icon:        '🔮',
    description: 'A new Gala Games universe is being forged. Complete other worlds to prepare for what\'s next.',
    color:       '#a855f7',
    gradient:    'linear-gradient(135deg, #2d1b69 0%, #4c1d95 50%, #5b21b6 100%)',
    levelCount:  0,
    unlockAfter: 999,
    comingSoon:  true,
    levels:      [],
  },
]
