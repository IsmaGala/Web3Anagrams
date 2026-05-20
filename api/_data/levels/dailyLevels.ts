import type { Level } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Daily Challenge Pool · "School Prep" (v1)
//
// Dedicated content pool for the daily-challenge mode. NOT shared with any
// regular world — the daily picks rotate through this list deterministically
// by calendar day (see getDailyLevelIndex in src/utils/gameUtils.ts).
//
// Design rules for this pool:
//   • Theme words come from school-prep vocabulary (READ, MATH, NOTE,
//     TEACH, LIBRARY, etc.) — friendly, broadly recognizable, age-light.
//   • Difficulty band: 3.0 → 7.0 (easy → mid). The daily is meant to be
//     winnable inside the 5-minute DAILY_DURATION timer with no hints.
//   • Word count per level: 3–4 words on the smallest themes, scaling up
//     to 6–8 on the longer themes. The largest level is HISTORY at 8 words.
//   • Every word is validated against its letter pool (each letter usable
//     up to its multiplicity in the level). See the verification script at
//     the top of this folder if adding new entries.
//
// Expansion: when adding a new daily pool (e.g. "Space", "Cooking"), create
// another file alongside this one and route it through dailyPoolsServerData
// or add it to a poolId map. The server lookup goes by worldId="daily" today;
// to support multiple pools the client can pass a pool selector and the
// server can swap which array it reads from.
// ─────────────────────────────────────────────────────────────────────────────

export const DAILY_LEVELS: Level[] = [
  // ── Levels 1–8 · Easy (3–4 letter themes, 3–5 words) ──────────────────────
  {
    theme: 'READ', difficulty: 3.0,
    letters: ['R','E','A','D'],
    words: ['ARE','EAR','ERA','READ'], bonus: [],
    defs: {
      ARE:'Present tense plural of "to be"',
      EAR:'The organ of hearing on either side of the head',
      ERA:'A long, distinct period of history',
      READ:'To look at and understand written words — a daily classroom essential',
    }
  },
  {
    theme: 'MATH', difficulty: 3.0,
    letters: ['M','A','T','H'],
    words: ['HAM','HAT','MAT','MATH'], bonus: [],
    defs: {
      HAM:'Meat from a pig\'s leg; an overacting performer',
      HAT:'A covering worn on the head',
      MAT:'A flat piece of fabric or material placed on the floor',
      MATH:'The study of numbers, quantities, and shapes — the foundation of every school day',
    }
  },
  {
    theme: 'IDEA', difficulty: 3.2,
    letters: ['I','D','E','A'],
    words: ['AID','DIE','AIDE','IDEA'], bonus: [],
    defs: {
      AID:'Help or assistance',
      DIE:'A small cube used in games; to stop living',
      AIDE:'A person who acts as an assistant',
      IDEA:'A thought or suggestion — what every good essay begins with',
    }
  },
  {
    theme: 'GRAD', difficulty: 3.2,
    letters: ['G','R','A','D'],
    words: ['RAG','RAD','DRAG','GRAD'], bonus: [],
    defs: {
      RAG:'A piece of old cloth used for cleaning',
      RAD:'Informal for radical or excellent; a unit of radiation',
      DRAG:'To pull along with effort; a resisting force',
      GRAD:'Short for graduate — the moment school prep finally pays off',
    }
  },
  {
    theme: 'PLAY', difficulty: 3.5,
    letters: ['P','L','A','Y'],
    words: ['LAY','PAL','PAY','PLAY'], bonus: ['YAP'],
    defs: {
      LAY:'To place down carefully',
      PAL:'A close friend',
      PAY:'To give money in exchange for goods or work',
      PLAY:'To engage in activity for enjoyment — recess essentials',
      YAP:'To bark sharply; to chatter noisily',
    }
  },
  {
    theme: 'NOTE', difficulty: 3.7,
    letters: ['N','O','T','E'],
    words: ['ONE','TEN','TOE','TONE','NOTE'], bonus: ['EON'],
    defs: {
      ONE:'The number 1',
      TEN:'The number 10',
      TOE:'A digit on the foot',
      TONE:'The quality of a sound or voice',
      NOTE:'A short written record — the backbone of every class binder',
      EON:'A very long period of time',
    }
  },
  {
    theme: 'PAGE', difficulty: 3.8,
    letters: ['P','A','G','E'],
    words: ['AGE','APE','GAP','PEA','PAGE'], bonus: ['GAPE'],
    defs: {
      AGE:'The length of time someone has lived',
      APE:'A large primate without a tail',
      GAP:'A space or opening',
      PEA:'A small round green vegetable',
      PAGE:'One side of a sheet in a book — turn it to keep reading',
      GAPE:'To stare with the mouth open in surprise',
    }
  },
  {
    theme: 'STUDY', difficulty: 4.0,
    letters: ['S','T','U','D','Y'],
    words: ['STY','STUD','DUST','STUDY'], bonus: [],
    defs: {
      STY:'A pen for pigs; a small swelling on the eyelid',
      STUD:'A small piece used for fastening or decorating',
      DUST:'Fine dry particles of matter',
      STUDY:'To devote time to learning — the heart of school prep',
    }
  },

  // ── Levels 9–16 · Easy–Mid (5-letter themes, 5 words) ─────────────────────
  {
    theme: 'READS', difficulty: 4.2,
    letters: ['R','E','A','D','S'],
    words: ['EAR','DARE','DEAR','READ','READS'], bonus: ['DARES'],
    defs: {
      EAR:'The organ of hearing',
      DARE:'To have the courage to do something',
      DEAR:'Loved and cherished; expensive',
      READ:'To understand the meaning of written symbols',
      READS:'Plural — interprets written text; a stack of books for the week',
      DARES:'Challenges to do something risky',
    }
  },
  {
    theme: 'NOTES', difficulty: 4.3,
    letters: ['N','O','T','E','S'],
    words: ['NET','NOTE','TONE','STONE','NOTES'], bonus: ['TONES'],
    defs: {
      NET:'An open-mesh fabric; the result after deductions',
      NOTE:'A short record or comment',
      TONE:'The general character of a sound or piece of writing',
      STONE:'A small piece of rock',
      NOTES:'Brief written records — your future self will thank you for them',
      TONES:'Variations in pitch or quality of sound',
    }
  },
  {
    theme: 'SPEAK', difficulty: 4.5,
    letters: ['S','P','E','A','K'],
    words: ['APE','PEA','SAKE','PEAK','SPEAK'], bonus: ['PEAKS'],
    defs: {
      APE:'A large tailless primate',
      PEA:'A small round green seed eaten as a vegetable',
      SAKE:'The purpose or reason for which something is done',
      PEAK:'The highest point of something',
      SPEAK:'To say words aloud — the first skill in any presentation',
      PEAKS:'Plural of peak; the highest points',
    }
  },
  {
    theme: 'LEARN', difficulty: 4.7,
    letters: ['L','E','A','R','N'],
    words: ['EAR','LEAN','EARN','NEAR','LEARN'], bonus: ['RENAL'],
    defs: {
      EAR:'The hearing organ',
      LEAN:'To slant; not fatty',
      EARN:'To get something through work or effort',
      NEAR:'A short distance away',
      LEARN:'To gain knowledge or skill — what classrooms are for',
      RENAL:'Relating to the kidneys',
    }
  },
  {
    theme: 'TEACH', difficulty: 4.8,
    letters: ['T','E','A','C','H'],
    words: ['ACHE','EACH','HATE','HEAT','TEACH'], bonus: ['CHEAT'],
    defs: {
      ACHE:'A continuous dull pain',
      EACH:'Every one of two or more, taken separately',
      HATE:'To strongly dislike',
      HEAT:'Warmth; high temperature',
      TEACH:'To help someone learn — the other side of the desk',
      CHEAT:'To act dishonestly to gain an advantage',
    }
  },
  {
    theme: 'PAPER', difficulty: 5.0,
    letters: ['P','A','P','E','R'],
    words: ['APE','RAP','PEAR','REAP','PAPER'], bonus: ['PREP'],
    defs: {
      APE:'A large primate without a tail',
      RAP:'A quick sharp knock; a style of music',
      PEAR:'A sweet juicy fruit narrow at the stem',
      REAP:'To cut and gather a crop or harvest',
      PAPER:'Material made in thin sheets — where every essay begins',
      PREP:'To prepare; preparatory work for a class or exam',
    }
  },
  {
    theme: 'PIANO', difficulty: 5.0,
    letters: ['P','I','A','N','O'],
    words: ['NAP','NIP','PAN','PAIN','PIANO'], bonus: ['PIN'],
    defs: {
      NAP:'A short sleep during the day',
      NIP:'To pinch or bite sharply',
      PAN:'A flat-bottomed metal container for cooking',
      PAIN:'Physical or emotional suffering',
      PIANO:'A keyboard instrument — the centerpiece of any music room',
      PIN:'A thin metal fastener with a sharp point',
    }
  },
  {
    theme: 'RULER', difficulty: 5.2,
    letters: ['R','U','L','E','R'],
    words: ['RUE','ERR','LURE','RULE','RULER'], bonus: [],
    defs: {
      RUE:'To regret deeply; a bitter herb',
      ERR:'To make a mistake',
      LURE:'Something that tempts or entices',
      RULE:'A regulation governing conduct; to govern',
      RULER:'A straight strip used to measure lengths — and to draw a straight line',
    }
  },

  // ── Levels 17–24 · Mid (5–6 letter themes, 6 words) ───────────────────────
  {
    theme: 'WRITE', difficulty: 5.3,
    letters: ['W','R','I','T','E'],
    words: ['WIT','RITE','TIER','TIRE','WIRE','WRITE'], bonus: ['IRE'],
    defs: {
      WIT:'Mental sharpness and inventiveness',
      RITE:'A religious or solemn ceremony',
      TIER:'A row or level in a series',
      TIRE:'To grow weary; a rubber wheel covering',
      WIRE:'A thin flexible thread of metal',
      WRITE:'To form letters or words on a surface — the partner of "read"',
      IRE:'Strong anger',
    }
  },
  {
    theme: 'GRADE', difficulty: 5.5,
    letters: ['G','R','A','D','E'],
    words: ['DARE','DEAR','GEAR','RAGE','READ','GRADE'], bonus: ['RAGED'],
    defs: {
      DARE:'To have the courage to attempt',
      DEAR:'Beloved; expensive',
      GEAR:'Equipment used for a particular purpose',
      RAGE:'Violent uncontrollable anger',
      READ:'To interpret written words',
      GRADE:'A mark indicating quality of work — the final verdict on a paper',
      RAGED:'Past tense of rage; showed violent anger',
    }
  },
  {
    theme: 'SLATE', difficulty: 5.6,
    letters: ['S','L','A','T','E'],
    words: ['LATE','SEAL','TALE','TEAL','STALE','STEAL','SLATE'], bonus: [],
    defs: {
      LATE:'Arriving after the expected time',
      SEAL:'A device used to close openings; a marine mammal',
      TALE:'A story',
      TEAL:'A blue-green color; a small duck',
      STALE:'No longer fresh',
      STEAL:'To take without permission',
      SLATE:'A flat piece of rock used historically as a writing surface in class',
    }
  },
  {
    theme: 'SHARP', difficulty: 5.7,
    letters: ['S','H','A','R','P'],
    words: ['ASH','PAR','RAP','HARP','RASH','SHARP'], bonus: ['HARPS'],
    defs: {
      ASH:'Powdery residue left after burning',
      PAR:'An equal level; a standard score in golf',
      RAP:'A quick sharp knock; a music genre',
      HARP:'A large triangular musical instrument with strings',
      RASH:'A breakout of red spots on the skin; acting without thought',
      SHARP:'Having a fine cutting edge — the pencil you want before a test',
      HARPS:'Plural of harp',
    }
  },
  {
    theme: 'LESSON', difficulty: 5.9,
    letters: ['L','E','S','S','O','N'],
    words: ['LENS','LESS','LONE','NOEL','NOSE','LESSON'], bonus: [],
    defs: {
      LENS:'A curved piece of glass that focuses light',
      LESS:'A smaller amount',
      LONE:'Alone; solitary',
      NOEL:'A Christmas carol',
      NOSE:'The organ of smell',
      LESSON:'A period of teaching on a single subject — the unit of school',
    }
  },
  {
    theme: 'NUMBER', difficulty: 6.0,
    letters: ['N','U','M','B','E','R'],
    words: ['RUB','RUN','BURN','NUMB','UMBER','NUMBER'], bonus: ['NUB'],
    defs: {
      RUB:'To move something back and forth against a surface',
      RUN:'To move quickly on foot',
      BURN:'To be on fire',
      NUMB:'Lacking feeling or sensation',
      UMBER:'A natural brown earth pigment',
      NUMBER:'A mathematical value — the language of math class',
      NUB:'A small lump or knob',
    }
  },
  {
    theme: 'SCHOOL', difficulty: 6.2,
    letters: ['S','C','H','O','O','L'],
    words: ['COL','COO','SOL','COOL','COOS','SCHOOL'], bonus: ['LOO'],
    defs: {
      COL:'A low point or pass between two peaks',
      COO:'The soft murmuring sound of a dove',
      SOL:'A musical note; the fifth note of the major scale',
      COOL:'Moderately cold; calmly composed',
      COOS:'Plural of coo; soft dove-like sounds',
      SCHOOL:'A place dedicated to teaching and learning — the whole point of this pool',
      LOO:'A toilet (British informal)',
    }
  },
  {
    theme: 'MARKER', difficulty: 6.3,
    letters: ['M','A','R','K','E','R'],
    words: ['MAR','RAM','MAKE','MARE','MARK','MARKER'], bonus: ['ARM'],
    defs: {
      MAR:'To spoil or damage',
      RAM:'A male sheep; to push forcefully',
      MAKE:'To produce or create',
      MARE:'An adult female horse',
      MARK:'A small area on a surface; a grade given to schoolwork',
      MARKER:'A pen with a thick felt tip — the whiteboard\'s best friend',
      ARM:'The upper limb of the body',
    }
  },
  {
    theme: 'PENCIL', difficulty: 6.4,
    letters: ['P','E','N','C','I','L'],
    words: ['PEN','LICE','LINE','NICE','PINE','PENCIL'], bonus: ['CLIP'],
    defs: {
      PEN:'A writing instrument that uses ink',
      LICE:'Plural of louse; tiny parasitic insects',
      LINE:'A long thin mark',
      NICE:'Pleasant; agreeable',
      PINE:'A type of evergreen tree',
      PENCIL:'A writing tool of graphite encased in wood — sharpen before the bell',
      CLIP:'A small device for holding things together',
    }
  },

  // ── Levels 25–30 · Mid (7-letter themes, 6–8 words) ───────────────────────
  {
    theme: 'CHAPTER', difficulty: 6.6,
    letters: ['C','H','A','P','T','E','R'],
    words: ['RACE','EACH','PEACH','REACH','HEART','CHEAT','CHAPTER'], bonus: ['PREACH'],
    defs: {
      RACE:'A competition of speed',
      EACH:'Every one, taken individually',
      PEACH:'A round soft fruit with yellow-pink skin',
      REACH:'To stretch out to touch or grasp',
      HEART:'The organ that pumps blood around the body',
      CHEAT:'To act dishonestly for an unfair advantage',
      CHAPTER:'A main division of a book — how the syllabus is sliced up',
      PREACH:'To deliver a sermon or moral talk',
    }
  },
  {
    theme: 'STUDENT', difficulty: 6.7,
    letters: ['S','T','U','D','E','N','T'],
    words: ['NUTS','USED','DENT','NEST','TENT','STUNT','STUDENT'], bonus: ['DUET'],
    defs: {
      NUTS:'Plural of nut; informal for crazy',
      USED:'Past tense of use; not new',
      DENT:'A slight hollow in a surface from a blow',
      NEST:'A structure built by a bird to lay eggs in',
      TENT:'A portable shelter of fabric stretched on poles',
      STUNT:'A daring feat; to slow growth',
      STUDENT:'A person who is studying — the whole audience for this game',
      DUET:'A piece of music performed by two people',
    }
  },
  {
    theme: 'TEACHER', difficulty: 6.8,
    letters: ['T','E','A','C','H','E','R'],
    words: ['ACHE','EACH','REACH','HEART','CHEAT','CHEER','TEACHER'], bonus: ['HEATER'],
    defs: {
      ACHE:'A continuous dull pain',
      EACH:'Every one, taken separately',
      REACH:'To stretch out to grasp something',
      HEART:'The blood-pumping organ',
      CHEAT:'To break the rules to gain advantage',
      CHEER:'To shout in approval or encouragement',
      TEACHER:'A person who instructs others — the one at the front of the room',
      HEATER:'A device that produces heat',
    }
  },
  {
    theme: 'LIBRARY', difficulty: 7.0,
    letters: ['L','I','B','R','A','R','Y'],
    words: ['RAY','BAIL','LIAR','LIRA','RAIL','AIRY','LIBRARY'], bonus: ['BAR'],
    defs: {
      RAY:'A narrow beam of light; a flat-bodied sea fish',
      BAIL:'Money paid to release someone from custody; to scoop water out',
      LIAR:'A person who tells lies',
      LIRA:'A former monetary unit of Italy and Turkey',
      RAIL:'A bar fixed horizontally for support; railway track',
      AIRY:'Spacious and full of fresh air; light and delicate',
      LIBRARY:'A building or room containing collections of books — the quietest room in school',
      BAR:'A long rigid piece of metal or wood; a place selling drinks',
    }
  },
  {
    theme: 'HISTORY', difficulty: 7.0,
    letters: ['H','I','S','T','O','R','Y'],
    words: ['TRY','HOST','THIS','HOIST','SHIRT','SHORT','STORY','HISTORY'], bonus: ['SHY'],
    defs: {
      TRY:'To make an attempt at something',
      HOST:'A person who entertains guests; a great number',
      THIS:'The thing nearby being referred to',
      HOIST:'To raise or lift something heavy with effort',
      SHIRT:'A garment for the upper body',
      SHORT:'Of small length; not tall',
      STORY:'An account of imaginary or real events; a narrative',
      HISTORY:'The study of past events — every textbook\'s favorite subject',
      SHY:'Nervous or timid in the company of others',
    }
  },
]
