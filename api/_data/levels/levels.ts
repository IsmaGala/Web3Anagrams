import type { Level } from '../types.js'

export const LEVELS: Level[] = [
  {
    theme: 'VAULT', difficulty: 4.05,
    letters: ['V','A','U','L','T'],
    words: ['VAT','ALT','LAT','VAULT'], bonus: [],
    defs: { VAT:'A large container for liquids; Value Added Tax', ALT:'Alternative; the Alt key; short for alt-coin', LAT:'A latissimus dorsi muscle; latitude', VAULT:'In DeFi, a vault is a smart contract that automatically deploys funds into yield-generating strategies' }
  },
  {
    theme: 'CHAIN', difficulty: 4.13,
    letters: ['C','H','A','I','N'],
    words: ['CAN','AIN','CHIN','CHAIN'], bonus: ['INCH','CHAI'],
    defs: { CAN:'To be able to; a metal container', AIN:'Own (Scottish dialect)', CHIN:'The lower part of the face', CHAIN:'A blockchain — a distributed ledger of linked and immutable transaction blocks', INCH:'A unit of length equal to 2.54 cm', CHAI:'A spiced tea drink; also a popular Ethereum Web3 library' }
  },
  {
    theme: 'PROXY', difficulty: 4.13,
    letters: ['P','R','O','X','Y'],
    words: ['POX','PRY','POXY','PROXY'], bonus: [],
    defs: { POX:'A disease causing skin eruptions; a curse (informal)', PRY:'To inquire too closely; to lever something open', POXY:'Of poor quality; annoying (British informal)', PROXY:'A proxy contract is an upgradeable smart contract pattern where logic can be swapped without changing the address users interact with' }
  },
  {
    theme: 'BLOCK', difficulty: 4.64,
    letters: ['B','L','O','C','K'],
    words: ['COB','LOB','LOCK','BLOC','BLOCK'], bonus: [],
    defs: { COB:'A corncob; a type of horse or coal', LOB:'To throw in a high arc', LOCK:'A fastening device; to secure', BLOC:'A group of countries or parties with a shared interest', BLOCK:'In blockchain, a bundle of validated transactions permanently recorded on the chain' }
  },
  {
    theme: 'TOKEN', difficulty: 6.57,
    letters: ['T','O','K','E','N'],
    words: ['TON','TOE','NET','TEN','TOK','TONE','NOTE','KNOT','TOKEN'], bonus: ['TOKE'],
    defs: { TON:'A unit of weight — also the TON blockchain', TOE:'One of the five digits on a foot', NET:'Remaining after deductions; a mesh network', TEN:'The number 10', TOK:'Slang for token', TONE:'Sound quality or character', NOTE:'A record, musical pitch, or short message', KNOT:'A fastening; a unit of nautical speed', TOKEN:'A digital asset on a blockchain representing value or access rights', TOKE:'Informal for token' }
  },
  {
    theme: 'SHARD', difficulty: 6.57,
    letters: ['S','H','A','R','D'],
    words: ['ADS','DAH','HAS','RAD','SAD','DASH','HARD','RASH','SHARD'], bonus: ['SHAD'],
    defs: { ADS:'Plural of ad; advertisements', DAH:'The longer signal in Morse code', HAS:'Third person singular of "have"', RAD:'A unit of radiation; informal for radical or cool', SAD:'Feeling sorrow or unhappiness', DASH:'To move quickly; a punctuation mark', HARD:'Firm and solid; difficult; hard fork in blockchain', RASH:'Acting without careful consideration', SHARD:"A network partition in sharding — Ethereum's scaling technique that splits the chain into parallel segments", SHAD:'A type of herring-like fish' }
  },
  {
    theme: 'STAKE', difficulty: 6.63,
    letters: ['S','T','A','K','E'],
    words: ['ATE','EAT','SAT','SET','SAKE','TAKE','TEAK','STEAK','STAKE'], bonus: ['SKATE'],
    defs: { ATE:'Past tense of eat', EAT:'To consume food', SAT:'Past tense of sit', SET:'A collection; to place or fix in position', SAKE:'Purpose or benefit; a Japanese rice wine', TAKE:'To reach out and hold; to obtain', TEAK:'A hard tropical hardwood', STEAK:'A thick slice of grilled meat', STAKE:'In Proof-of-Stake, tokens locked as collateral to validate transactions and earn rewards', SKATE:'To glide on ice or a skateboard' }
  },
  {
    theme: 'GENESIS', difficulty: 7.10,
    letters: ['G','E','N','E','S','I','S'],
    words: ['GEN','GIN','SEE','SIN','GENE','SINE','SEEN','SEINE','GENESIS'], bonus: ['SIEGE','SENSEI'],
    defs: { GEN:'Information or intelligence (British informal)', GIN:'A spirit flavored with juniper berries', SEE:'To perceive with the eyes', SIN:'An immoral act; a trigonometric function', GENE:'A unit of heredity encoded in DNA', SINE:'A trigonometric function; without (Latin)', SEEN:'Past participle of see', SEINE:'A large fishing net; the river through Paris', GENESIS:'The Genesis Block is the very first block mined on a blockchain — the hardcoded origin of the entire chain', SIEGE:'A military blockade', SENSEI:'A teacher or instructor in Japanese martial arts' }
  },
  {
    theme: 'BRIDGE', difficulty: 7.34,
    letters: ['B','R','I','D','G','E'],
    words: ['BID','DIG','RIB','RIG','RIDE','DIRE','GIRD','GRID','BRED','BRIDGE'], bonus: ['GIBED'],
    defs: { BID:'An offer of a price; to command', DIG:'To excavate; to understand (slang)', RIB:'A curved bone; to tease gently', RIG:'To set up equipment; to manipulate unfairly', RIDE:'To sit on and be carried; a journey', DIRE:'Extremely serious or urgent', GIRD:'To encircle; to prepare for action', GRID:'A network of lines; an electrical distribution network', BRED:'Past tense of breed', BRIDGE:'A cross-chain bridge — a protocol that lets assets move between different blockchains', GIBED:'Past tense of gibe — to taunt or jeer' }
  },
  {
    theme: 'HOLDER', difficulty: 7.40,
    letters: ['H','O','L','D','E','R'],
    words: ['HER','HOD','HOE','DOLE','HOLE','HELD','ROLE','LODE','OLDER','HOLDER'], bonus: ['HOLED'],
    defs: { HER:'Belonging to a female person', HOD:'A V-shaped trough for carrying bricks', HOE:'A long-handled garden tool', DOLE:'Unemployment benefit; to distribute in shares', HOLE:'An opening or gap', HELD:'Past tense of hold', ROLE:'A function or part played', LODE:'A vein of metal ore; a rich source', OLDER:'Having lived for more years', HOLDER:'In crypto, a HODLer keeps tokens long-term rather than trading, believing in future value', HOLED:'Having a hole made in it' }
  },
  {
    theme: 'LEDGER', difficulty: 8.85,
    letters: ['L','E','D','G','E','R'],
    words: ['EEL','ELD','GEL','LED','LEE','RED','GLEE','REED','REEL','DEER','ELDER','LEDGE','LEDGER'], bonus: ['GREED'],
    defs: { EEL:'A snake-like fish', ELD:'Old age (archaic)', GEL:'A thick jelly-like substance', LED:'Past tense of lead; LED lighting', LEE:'Shelter from the wind', RED:'The color of blood; in crypto charts, a falling price candle', GLEE:'Great delight or joy', REED:'A tall grass-like plant', REEL:'A spool; to wind; to stagger', DEER:'A hoofed grazing animal', ELDER:'An older or more experienced person', LEDGE:'A narrow horizontal surface projecting from a wall', LEDGER:'A distributed ledger is the shared, immutable record of all transactions across all blockchain nodes', GREED:'Intense desire for wealth — both a driver and a risk in crypto markets' }
  },
  {
    theme: 'WALLET', difficulty: 9.31,
    letters: ['W','A','L','L','E','T'],
    words: ['AWE','ATE','EAT','WET','LAW','ALE','LATE','TALE','TEAL','WALL','WELL','TELL','WELT','WALLET'], bonus: [],
    defs: { AWE:'A feeling of wonder or reverence', ATE:'Past tense of eat', EAT:'To consume food', WET:'Covered with water or liquid', LAW:'A rule enforced by authority', ALE:'A type of beer', LATE:'After the expected time', TALE:'A story or narrative', TEAL:'A blue-green color', WALL:'A vertical barrier or boundary', WELL:'In good health; a source of water', TELL:'To communicate or reveal information', WELT:'A raised mark; a reinforced edge or seam', WALLET:'A crypto wallet stores private keys and manages digital assets — never share your seed phrase' }
  },
  {
    theme: 'CRYPTO', difficulty: 9.34,
    letters: ['C','R','Y','P','T','O'],
    words: ['COP','CRY','OPT','POT','TOP','ROT','PRY','COPY','CROP','PORT','TROY','TYPO','CRYPT','CRYPTO'], bonus: ['TYRO','ROPY'],
    defs: { COP:'A police officer; to obtain', CRY:'To weep; to call out loudly', OPT:'To make a deliberate choice', POT:'A container; the total prize pool', TOP:'The highest point or layer', ROT:'To decay; nonsense (informal)', PRY:'To inquire nosily', COPY:'A duplicate; to reproduce', CROP:'To cut short; an agricultural harvest', PORT:'A harbor; a connection socket', TROY:'Troy weight — the system used to weigh gold and silver', TYPO:'A typing or printing error', CRYPT:'An underground vault; root word meaning "hidden"', CRYPTO:'Short for cryptography or cryptocurrency — digital assets secured by cryptographic proofs', TYRO:'A beginner or novice', ROPY:'Of poor quality (British informal)' }
  },
  {
    theme: 'ESCROW', difficulty: 9.36,
    letters: ['E','S','C','R','O','W'],
    words: ['COW','ORE','OWE','ROE','ROW','SOW','CORE','CREW','CROW','WORE','ROWS','SCORE','WORSE','ESCROW'], bonus: ['CORES'],
    defs: { COW:'A female bovine; to intimidate', ORE:'Rock containing valuable minerals', OWE:'To be under obligation to pay', ROE:'Fish eggs', ROW:'A line of things; to propel a boat; a quarrel', SOW:'To plant seeds; a female pig', CORE:'The central or most important part', CREW:'A group working together', CROW:'A black bird; to boast', WORE:'Past tense of wear', ROWS:'Plural of row', SCORE:'A count of points; musical notation', WORSE:'Of poorer quality or greater severity', ESCROW:'A smart-contract escrow holds funds until both parties fulfill conditions — trustless and automated', CORES:'Plural of core' }
  },
  {
    theme: 'SMART', difficulty: 9.58,
    letters: ['S','M','A','R','T'],
    words: ['ART','MAR','MAT','RAM','RAT','SAT','TAR','ARMS','ARTS','MARS','MAST','RATS','STAR','TRAM','SMART'], bonus: ['TARS','RAMS'],
    defs: { ART:'Creative expression', MAR:'To damage or spoil', MAT:'A flat piece of material', RAM:'A male sheep; Random Access Memory', RAT:'A rodent; an informer (slang)', SAT:'Past tense of sit', TAR:'A dark viscous liquid', ARMS:'Weapons; upper limbs', ARTS:'The creative disciplines', MARS:'The red planet; to damage', MAST:'A tall pole on a ship', RATS:'Plural of rat', STAR:'A luminous celestial body', TRAM:'A streetcar running on rails', SMART:'Smart contract — self-executing code on the blockchain that automatically enforces agreed terms without intermediaries', TARS:'Plural of tar', RAMS:'Plural of ram' }
  },
  {
    theme: 'NODES', difficulty: 10.09,
    letters: ['N','O','D','E','S'],
    words: ['DEN','DOE','DON','EON','NOD','ODE','SON','DONE','DOSE','NODE','NOES','NOSE','ONES','EONS','DENS','NODES'], bonus: ['SEND'],
    defs: { DEN:"A cozy private room; an animal's lair", DOE:'A female deer or rabbit', DON:'To put on clothing; a university lecturer', EON:'An indefinitely long period of time', NOD:'A downward head movement signaling agreement', ODE:'A type of lyric poem', SON:'A male child', DONE:'Completed or finished', DOSE:'A measured quantity of medicine', NODE:'Any computer participating in the blockchain network, storing and validating the full ledger', NOES:'Plural of no; votes against', NOSE:'The organ of smell', ONES:'Plural of one', EONS:'Plural of eon', DENS:'Plural of den', NODES:'The computers making up a blockchain network — each holds a copy of the full ledger', SEND:'To transmit; in crypto, to transfer tokens to another wallet address' }
  },
  {
    theme: 'DEFI', difficulty: 10.32,
    letters: ['D','E','F','I','N','E'],
    words: ['DEN','DIE','DIN','END','FED','FIE','FIN','DINE','FEND','FIND','FINE','NEED','FEED','FIEND','DEFINE','DEFI'], bonus: ['FINED'],
    defs: { DEN:"A cozy private room; an animal's lair", DIE:'To cease living; a cube used in games', DIN:'A loud continuous noise', END:'The final point or conclusion', FED:'Past tense of feed; informal for the US Federal Reserve', FIE:'An exclamation of disapproval', FIN:'A wing-like appendage on a fish', DINE:'To eat a formal meal', FEND:'To defend oneself', FIND:'To locate or discover', FINE:'Of high quality; a monetary penalty', NEED:'A requirement or necessity', FEED:'To supply food; a live data stream (price feed, oracle feed)', FIEND:'A devoted enthusiast; a wicked person', DEFINE:'To state the exact meaning of a word or concept', DEFI:'Decentralized Finance — open financial protocols on blockchain replacing banks and brokers', FINED:'Penalized with a financial charge' }
  },
  {
    theme: 'AIRDROP', difficulty: 10.56,
    letters: ['A','I','R','D','R','O','P'],
    words: ['AID','AIR','PAD','PAR','PRO','RAD','RID','DROP','PAIR','PAID','ROAD','DRIP','PROD','RAPID','RADIO','AIRDROP'], bonus: ['OAR'],
    defs: { AID:'Help or assistance', AIR:'The invisible gaseous mixture we breathe; to broadcast', PAD:'A flat cushioned surface; a notebook; a home (informal)', PAR:'Equal level; standard score in golf', PRO:'A professional; in favor of', RAD:'A unit of radiation; informal for radical or excellent', RID:'To free from something unwanted', DROP:'To fall; a small amount of liquid', PAIR:'Two matching things; to couple together', PAID:'Past tense of pay', ROAD:'A path or route for travel', DRIP:'A slow flow of liquid; stylish fashion (slang)', PROD:'To poke; to encourage into action', RAPID:'Very fast or quick', RADIO:'Wireless transmission of signals', AIRDROP:'A distribution of free tokens to wallet addresses — used to reward early users or bootstrap a community', OAR:'A pole used to row a boat' }
  },
  {
    theme: 'MINTER', difficulty: 11.38,
    letters: ['M','I','N','T','E','R'],
    words: ['MEN','NET','RIM','TEN','IRE','MINE','MINT','MIRE','TIRE','TIER','TRIM','RENT','REIN','TERM','ITEM','MERIT','MINER','MINTER'], bonus: ['INERT','INTER'],
    defs: { MEN:'Plural of man', NET:'Remaining after deductions; a mesh', RIM:'The outer edge of a circular object', TEN:'The number 10', IRE:'Anger or wrath', MINE:'To extract resources; in crypto, to validate transactions and earn block rewards', MINT:'To create a new NFT or coin on-chain for the first time', MIRE:'Soft swampy ground; to be stuck', TIRE:'To grow weary; a rubber ring', TIER:'A level or rank in a layered system', TRIM:'To cut neatly', RENT:'Payment for temporary use', REIN:'A strap to control a horse; to restrain', TERM:'A defined period; a word or expression', ITEM:'A single entry in a list', MERIT:'The quality of deserving reward', MINER:'A node that solves proof-of-work puzzles to add blocks and earn rewards', MINTER:'One who mints — creates and deploys new NFTs or tokens on the blockchain', INERT:'Lacking motion, energy, or chemical activity', INTER:'To bury; prefix meaning "between"' }
  },
  {
    theme: 'ORACLE', difficulty: 12.31,
    letters: ['O','R','A','C','L','E'],
    words: ['ACE','ARC','ARE','CAR','EAR','ERA','OAR','ORE','ACRE','ALOE','CARE','COAL','COLA','CORE','LACE','LORE','ORAL','RACE','ROLE','ORACLE'], bonus: ['CAROL','CORAL'],
    defs: { ACE:'An expert; a playing card; to excel', ARC:'A curved line; part of a circle', ARE:'Second person singular of "be"', CAR:'A motor vehicle', EAR:'The organ of hearing', ERA:'A long and distinct period of history', OAR:'A pole used to row a boat', ORE:'Rock containing valuable minerals', ACRE:'A unit of land area', ALOE:'A succulent plant used medicinally', CARE:'Serious attention or caution', COAL:'A combustible black rock; proof-of-work mining consumes enormous energy', COLA:'A carbonated soft drink', CORE:'The central or most important part; also Core DAO', LACE:'A delicate openwork fabric', LORE:'A body of knowledge on a subject', ORAL:'Spoken rather than written', RACE:'A competition; to move swiftly', ROLE:'A function or part played', ORACLE:'A blockchain oracle — a service that brings real-world data on-chain for smart contracts', CAROL:'A joyful song', CORAL:'A marine organism; a pinkish-orange color' }
  },
]
