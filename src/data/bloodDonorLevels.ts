import type { Level } from '../types'

// World Blood Donor Day — annual observance on June 14 to raise awareness
// of safe blood donation. Themes follow the donation journey: the body's
// circulatory plumbing → the clinical setting → blood components → the act
// of giving → the courage it takes. Difficulty crescendos 3.0 → 7.5,
// matching the Deep Sea event so the two feel like siblings in the rotation.

export const BLOOD_DONOR_LEVELS: Level[] = [
  {
    theme: 'VEINS', difficulty: 3.0,
    letters: ['V','E','I','N','S'],
    words: ['VEINS','VINES','SINE','VIES','NEVI','VIN','VIE','SIN','INS','NIE'], bonus: [],
    defs: {
      VEINS: 'Blood vessels that carry blood back toward the heart',
      VINES: 'Climbing plants',
      SINE: 'A trigonometric function',
      VIES: 'Competes',
      NEVI: 'Moles or birthmarks on the skin — plural of nevus',
      VIN: 'Wine (French)',
      VIE: 'To compete',
      SIN: 'A moral offense',
      INS: 'Those in office',
      NIE: 'To draw near (Scots)',
    }
  },
  {
    theme: 'PULSE', difficulty: 3.5,
    letters: ['P','U','L','S','E'],
    words: ['PULSE','PULES','SLUE','PLUS','LUES','USE','SUP','UPS','SUE','PUS'], bonus: ['LEPS'],
    defs: {
      PULSE: 'The rhythmic throb of the heart felt through the arteries',
      PULES: 'Cries weakly, like a young animal',
      SLUE: 'To turn or pivot on a fixed point',
      PLUS: 'In addition to',
      LUES: 'Syphilis, in older medical usage',
      USE: 'To employ for a purpose',
      SUP: 'To drink slowly',
      UPS: 'Raises; increases',
      SUE: 'To bring a legal claim against',
      PUS: 'The thick fluid that gathers at an infection site',
      LEPS: 'Plural of lep — leaps (dialectal)',
    }
  },
  {
    theme: 'HEART', difficulty: 4.0,
    letters: ['H','E','A','R','T'],
    words: ['HEART','EARTH','HATER','HARE','HATE','HEAT','RATE','TEAR','HEAR','HART'], bonus: ['RATHE','THAE'],
    defs: {
      HEART: 'The four-chambered muscular pump that circulates blood',
      EARTH: 'Our planet',
      HATER: 'One who hates',
      HARE: 'A swift, long-eared mammal',
      HATE: 'To intensely dislike',
      HEAT: 'A high temperature',
      RATE: 'Pulse rate is measured in beats per minute',
      TEAR: 'A drop of saline fluid from the eye',
      HEAR: 'To perceive sound',
      HART: 'A male deer, especially a red deer',
      RATHE: 'Coming early, before the usual time (archaic)',
      THAE: 'Those (Scots)',
    }
  },
  {
    theme: 'NURSE', difficulty: 4.5,
    letters: ['N','U','R','S','E'],
    words: ['NURSE','RUNES','USER','SURE','RUNE','RUSE','RUNS','URN','RUE','RUN'], bonus: ['ERNS','URNS'],
    defs: {
      NURSE: 'The clinician who most often draws the donor\'s blood',
      RUNES: 'Ancient alphabetic symbols, especially Germanic and Nordic',
      USER: 'One who uses',
      SURE: 'Certain; confident',
      RUNE: 'A single rune symbol',
      RUSE: 'A clever trick',
      RUNS: 'Moves swiftly on foot',
      URN: 'A tall, ornamented vessel',
      RUE: 'To regret bitterly',
      RUN: 'To move at speed',
      ERNS: 'Sea-eagles (plural)',
      URNS: 'Multiple urns',
    }
  },
  {
    theme: 'SERUM', difficulty: 5.0,
    letters: ['S','E','R','U','M'],
    words: ['SERUM','MURES','MUSER','MUSE','EMUS','RUSE','RUMS','USER','SURE','SUM'], bonus: ['SUER'],
    defs: {
      SERUM: 'The clear yellowish liquid left when blood clots — plasma minus clotting factors',
      MURES: 'Walls or encloses (archaic)',
      MUSER: 'One who muses or contemplates',
      MUSE: 'To ponder thoughtfully',
      EMUS: 'Large flightless Australian birds',
      RUSE: 'A trick',
      RUMS: 'Quantities of rum',
      USER: 'One who uses',
      SURE: 'Certain',
      SUM: 'A total',
      SUER: 'One who sues',
    }
  },
  {
    theme: 'LIVER', difficulty: 5.5,
    letters: ['L','I','V','E','R'],
    words: ['LIVER','VILER','LIVRE','VEIL','VILE','EVIL','LIVE','RIVE','RILE','LIER'], bonus: ['RIEL'],
    defs: {
      LIVER: 'The body\'s largest internal organ — filters blood and processes nutrients',
      VILER: 'More vile; more wicked',
      LIVRE: 'An old French unit of currency and weight',
      VEIL: 'A piece of fine fabric worn over the head or face',
      VILE: 'Morally despicable',
      EVIL: 'Profoundly immoral',
      LIVE: 'To be alive',
      RIVE: 'To split or tear apart',
      RILE: 'To anger or irritate',
      LIER: 'One who lies in wait (legal term)',
      RIEL: 'The currency of Cambodia',
    }
  },
  {
    theme: 'MEDIC', difficulty: 6.0,
    letters: ['M','E','D','I','C'],
    words: ['MEDIC','DIME','MICE','ICED','DICE','IDEM','EMIC','CEDI','MED','DIM'], bonus: ['DIE','MIC'],
    defs: {
      MEDIC: 'A medical worker, especially in the field',
      DIME: 'A ten-cent coin',
      MICE: 'Small rodents, common in medical research',
      ICED: 'Cooled with ice — blood bags are kept chilled until use',
      DICE: 'Small numbered cubes',
      IDEM: 'The same, used in citations (Latin)',
      EMIC: 'Relating to the internal view of a culture',
      CEDI: 'The currency of Ghana',
      MED: 'A medication (informal)',
      DIM: 'Faint, not bright',
      DIE: 'To stop living',
      MIC: 'Short for microphone',
    }
  },
  {
    theme: 'PLASMA', difficulty: 6.5,
    letters: ['P','L','A','S','M','A'],
    words: ['PLASMA','PSALM','LAMAS','PALMS','LAMPS','ALMA','PALM','MAPS','AMPS','ALMS'], bonus: ['SLAM','SPAM'],
    defs: {
      PLASMA: 'The liquid component of blood — about 55% of total volume',
      PSALM: 'A sacred song or hymn',
      LAMAS: 'Tibetan or Mongolian Buddhist monks',
      PALMS: 'Tropical trees; the inner surfaces of hands',
      LAMPS: 'Lights with a base, shade, and bulb',
      ALMA: 'A learned woman; the soul (poetic)',
      PALM: 'A palm tree',
      MAPS: 'Charts of geographic areas',
      AMPS: 'Units of electric current',
      ALMS: 'Charitable donations — gifts to those in need',
      SLAM: 'To shut or hit with force',
      SPAM: 'Unsolicited messages; a canned meat product',
    }
  },
  {
    theme: 'DONATE', difficulty: 7.0,
    letters: ['D','O','N','A','T','E'],
    words: ['DONATE','ATONED','ANODE','ATONE','NOTED','TONED','DOTE','NODE','TONE','NOTE'], bonus: ['OATEN','ANTED'],
    defs: {
      DONATE: 'To give freely — the central act of blood donation',
      ATONED: 'Made amends for a wrong',
      ANODE: 'The positive electrode of a battery or cell',
      ATONE: 'To make amends',
      NOTED: 'Famous; remarked upon',
      TONED: 'Adjusted in pitch or color',
      DOTE: 'To bestow excessive love or attention',
      NODE: 'A point of connection — also a junction in lymph or nerve networks',
      TONE: 'A musical pitch or quality of sound',
      NOTE: 'A short written or musical record',
      OATEN: 'Made of oats',
      ANTED: 'Put up an ante in a card game',
    }
  },
  {
    theme: 'COURAGE', difficulty: 7.5,
    letters: ['C','O','U','R','A','G','E'],
    words: ['COURAGE','COUGAR','AUGER','ARGUE','ROUGE','RACE','ACRE','CARE','CURE','CORE'], bonus: ['OGRE','ERGO'],
    defs: {
      COURAGE: 'The bravery to give what saves another life — every donor\'s gift',
      COUGAR: 'A large wild cat of the Americas; a mountain lion',
      AUGER: 'A tool for boring holes in wood or earth',
      ARGUE: 'To exchange opposing views',
      ROUGE: 'Reddish cosmetic powder',
      RACE: 'A competition of speed',
      ACRE: 'A unit of land area',
      CARE: 'Attention paid to avoiding harm',
      CURE: 'A treatment that heals',
      CORE: 'The central part of something',
      OGRE: 'A monstrous fairy-tale giant',
      ERGO: 'Therefore (Latin)',
    }
  },
]
