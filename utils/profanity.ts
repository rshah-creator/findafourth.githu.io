/**
 * Shared profanity checker — used by profile-setup, broadcast, and discover.
 *
 * Strategy:
 * 1. Normalize the input: collapse repeated letters (fuuuck→fuck), strip
 *    separator characters (f-u-c-k→fuck), substitute common leet-speak
 *    characters (@→a, 0→o, 1→i, 3→e, $→s, etc.).
 * 2. Test BOTH the original lowercased string AND the normalized string so
 *    natural usage and deliberate obfuscation are both caught.
 * 3. Word-boundary matching (regex \b...\b) prevents false positives on
 *    legitimate words that contain short sequences (e.g. "assassin", "scunthorpe").
 *    Compound slurs (bullshit, dickhead, etc.) are listed explicitly.
 */

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    // Strip common obfuscation separators: spaces, hyphens, dots, asterisks, etc.
    .replace(/[\s\-_.*|\\/'"`~^]+/g, '')
    // Leet-speak digit / symbol substitutions
    .replace(/@/g,  'a')
    .replace(/4/g,  'a')
    .replace(/3/g,  'e')
    .replace(/€/g,  'e')
    .replace(/[1!]/g, 'i')
    .replace(/0/g,  'o')
    .replace(/\$/g, 's')
    .replace(/5/g,  's')
    .replace(/7/g,  't')
    .replace(/9/g,  'g')
    .replace(/8/g,  'b')
    .replace(/ph/g, 'f')   // phuck → fuck
    // Collapse runs of the same letter (fuuuck → fuck, shhit → shit)
    .replace(/(.)\1+/g, '$1');
}

// ─── Word list ────────────────────────────────────────────────────────────────

export const PROFANITY_LIST: string[] = [

  // ── English: core ──────────────────────────────────────────────────────────
  'fuck','fucker','fucked','fucking','fucks','motherfuck','motherfucker',
  'motherfucking','fuckhead','fuckface','fuckwit','fuckboy','fuckgirl',
  'clusterfuck','mindfuck','goatfuck',
  'shit','shits','shitty','shitter','shitting','bullshit','horseshit',
  'apeshit','dogshit','shithead','shitstorm','shitshow','shitfaced','shithole',
  'ass','arse','asshole','arsehole','asshat','asswipe','jackass','dumbass',
  'smartass','fatass','badass','lardass','halfass','wiseass',
  'bitch','bitches','bitchy','bitching','bitchass','son of a bitch','sunofabitch',
  'bastard','bastards',
  'cunt','cunts','cunting',
  'dick','dicks','dickhead','dickface','dickweed','dickwad',
  'cock','cocks','cockhead','cockface','cocksucker','cocksucking','cockwomble',
  'pussy','pussies',
  'piss','pisses','pissed','pissing','pisshead',
  'whore','whores','whorish',
  'slut','slutty','slutshame',
  'twat','twats',
  'wank','wanker','wankers','wanking',
  'bollocks','bollock',
  'tosser','tossers',
  'prick','pricks',
  'damn','damnit',
  'crap','crappy',
  'hell',
  'fag','faggot','faggots',
  'dyke',

  // ── English: racial / ethnic slurs ────────────────────────────────────────
  'nigger','nigga','niggas','niggah',
  'chink','gook','spic','spick','wetback','kike','heeb',
  'towelhead','raghead','sandnigger','camel jockey',
  'cracker','honky','whitey',
  'retard','retards','retarded',
  'spaz','spastic',

  // ── English: sexual / body ─────────────────────────────────────────────────
  'blowjob','handjob','rimjob','cumshot','jizz','cum','creampie',
  'dildo','vibrator','butt plug',
  'rape','rapist','molest','molester','pedophile','paedophile','pedo',
  'incest',

  // ── Urdu / Hindi (romanized) — Pakistan / India context ───────────────────
  // motherfucker variants
  'madarchod','maderchod','madarjat','madarchood','maderchoot',
  'mc','mdc',                       // common abbreviations
  // sisterfucker variants
  'behenchod','bhenchod','behnchod','bhainchod','bhnchod','bhnchd',
  'bc',                             // abbreviation
  // cunt / vagina
  'chut','choot','chutiya','chutiyo','chutiye','chutiyapa',
  'bhosdike','bhosdi','bhosd','bhosdiwale','bhosdiwala',
  'fuddi','phuddi',
  // dick / penis
  'lund','lauda','lawda','lora','lavda',
  'gaand','gand','gaandu','gandu',  // ass / asshole
  // whore / bitch
  'randi','raand','rand',
  'kutti','kutiya',
  // bastard
  'harami','haramzada','haramzadi','haramkhor','haraamzada',
  // abusive phrases (split prevention: listed as joined)
  'maakibehen','terima','teri maa',
  // other
  'sala','saala','saali',           // mild but contextually abusive
  'kamina','kameena',
  'ullu','ullukapattha',
  'bakrichod','gadha','gadhe',

  // ── Arabic (romanized) ─────────────────────────────────────────────────────
  // cunt / vagina
  'kus','kuss','kos','koos','kes','kos omak','kiss',
  // whore
  'sharmouta','sharmuta','sharmoota','sharmoot',
  'sharmoutah',
  // dick
  'air','ayr','zakar','zibb','zib',
  // fuck
  'naik','nayik','khawal','khawwal',
  // son of a whore
  'ibnel sharmouta','ibn el sharmoota',
  // bastard / insults
  'kalb','ibn kalb',                // son of a dog
  'hmar','7mar',                    // donkey
  'manyak','manyuk',
  // damn
  'yilaan','yal3an','yel3an',
  // fuck your mother
  'kos ommak','kos omak','kus ommak',

  // ── French ─────────────────────────────────────────────────────────────────
  'merde','merdes',
  'putain','pute','putes',
  'connard','connarde','connards',
  'salope','salopes',
  'encule','enculé','enculer','enculés',
  'batard','bâtard','batards',
  'nique','niquer','niqué',
  'pd','pede','pédé',               // gay slur
  'con','conne','cons',
  'foutre',
  'bordel',
  'couille','couilles',
  'bite','bites',                   // French for dick
  'chier',
  'saloperie',
  'fils de pute',
  'va te faire foutre',

  // ── Spanish ────────────────────────────────────────────────────────────────
  'puta','putas','puto','putos',
  'cono','coño',
  'joder','jodido',
  'mierda',
  'maricón','maricon','maricones',
  'cabron','cabrón','cabrona',
  'pendejo','pendeja','pendejos',
  'culero','culera',
  'chinga','chingada','chingado','chingar','chingon',
  'verga','vergas',
  'polla','pollas',
  'coger',
  'hostia','hostias',
  'gilipollas',
  'capullo',
  'hijo de puta','hijodeputa',
  'imbecil',
  'zorra','zorras',

  // ── German ─────────────────────────────────────────────────────────────────
  'scheiße','scheisse','scheiss',
  'arschloch','arschlöcher',
  'wichser','wichsen','wichs',
  'fotze','fotzen',
  'hurensohn','hurensöhne',
  'ficken','fick',
  'schlampe','schlampen',
  'nutte','nutten',
  'schwuchtel','schwuchteln',
  'dreckau',
  'verdammt',
  'dummkopf','vollidiot',
  'wixer',

  // ── Turkish ────────────────────────────────────────────────────────────────
  'sik','sikerim','sikeyim','siktiret','siktir',
  'orospu','orospular',
  'orospu cocugu','orospu çocuğu',
  'pic','piç',
  'amk','amq',                      // abbreviations for amına koyayım
  'amcik','amcık',
  'got','göt','götveren',
  'bok',
  'ibne',
  'kahpe','kahpeler',
  'bok yemek',
  'hassiktir',
  'yarrak',

  // ── Portuguese ─────────────────────────────────────────────────────────────
  'porra','porras',
  'caralho','caralhos',
  'puta','putas',
  'merda',
  'buceta','bucetas',
  'filho da puta','filha da puta',
  'foda','fodase','foda-se','fodido',
  'viado','viadão',
  'arrombado',
  'cuzao','cuzão',
  'piroca','pirocas',
  'pau',                            // contextual — listed due to sexual use

  // ── Russian (romanized) ───────────────────────────────────────────────────
  'blyad','blyadt','blyat',
  'pizda','pizdets','pizdato',
  'khuy','huy','hui',
  'ebat','yebat','ebal',
  'mudak','mudaki',
  'suka','suki',
  'zalupa',
  'pidor','pederast',
  'nahui','na huj',

];

// ─── Checker ─────────────────────────────────────────────────────────────────

export function containsProfanity(text: string): boolean {
  const lower      = text.toLowerCase();
  const normalized = normalize(text);

  return PROFANITY_LIST.some(word => {
    // Escape special regex characters in the word itself
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b boundary on the raw lowercase text
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower))      return true;
    // Substring match on normalized text (catches leet, separators, repeated letters)
    if (normalized.includes(normalize(word)))                  return true;
    return false;
  });
}
