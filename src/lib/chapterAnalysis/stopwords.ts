/**
 * Stopwords for repetition detection.
 *
 * Deliberately NOT stopworded even though they're common: god, lord, jesus,
 * christ, spirit, word, light, law, faith, love, sin, grace - these are the
 * words Repetition Radar exists to surface.
 */

const STOPWORD_LIST: readonly string[] = [
  // Articles, conjunctions, prepositions
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'if', 'then',
  'because', 'since', 'although', 'though', 'while', 'when', 'whenever', 'where',
  'wherever', 'whence', 'whither', 'until', 'till', 'unless', 'whether', 'as',
  'than', 'that', 'which', 'who', 'whom', 'whose', 'whoever', 'whomever',
  'whatever', 'whichever', 'of', 'in', 'on', 'at', 'by', 'to', 'from', 'with',
  'without', 'within', 'into', 'upon', 'over', 'under', 'above', 'below',
  'between', 'among', 'through', 'throughout', 'during', 'before', 'after',
  'about', 'against', 'toward', 'towards', 'up', 'down', 'out', 'off', 'again',
  'further', 'once', 'per', 'via', 'how', 'why',

  // Determiners, quantifiers
  'this', 'these', 'those', 'there', 'here', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'others', 'some', 'such', 'no', 'not',
  'only', 'own', 'same', 'too', 'very', 'one', 'ones', 'two', 'now',

  // Pronouns
  'it', 'its', 'itself', 'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our',
  'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he',
  'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'they', 'them',
  'their', 'theirs', 'themselves', 'what', 'someone', 'something', 'anything',
  'everything', 'nothing', 'everyone', 'anyone', 'none',

  // Auxiliaries / forms of be, have, do
  'am', 'is', 'are', 'was', 'were', 'been', 'being', 'be', 'have', 'has',
  'had', 'having', 'do', 'does', 'did', 'doing', 'done', 'can', 'could',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'ought', 'let',

  // Narrative filler verbs the plan calls out by name
  'said', 'says', 'saying', 'came', 'went', 'goes', 'going', 'gone', 'also',
  'even', 'made', 'make', 'took', 'take', 'come', 'get', 'got', 'say', 'see',
  'saw', 'put',

  // KJV-isms
  'thee', 'thou', 'thy', 'thine', 'ye', 'unto', 'hath', 'hast', 'doth', 'dost',
  'saith', 'sayest', 'spake', 'wherefore', 'whereof', 'whereby', 'wherein',
  'whereupon', 'thereof', 'thereby', 'therein', 'thereupon', 'hereof',
  'hereby', 'herein', 'art', 'wilt', 'shalt', 'wouldest', 'couldst',
  'shouldst', 'canst', 'verily', 'behold', 'lo', 'yea', 'nay', 'peradventure',
  'howbeit', 'notwithstanding', 'forasmuch',
];

export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_LIST);

/** Deliberately deprioritized: picked only when no other candidate qualifies. */
export const DEPRIORITIZED: ReadonlySet<string> = new Set([
  'god', 'lord', 'jesus', 'christ', 'israel', 'king', 'man', 'people', 'day',
  'land', 'son', 'house', 'children',
]);
