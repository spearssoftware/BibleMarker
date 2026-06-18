import { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Anchor, ArrowFatDown, ArrowFatUp, ArrowLeft, ArrowRight, ArrowsClockwise, ArrowsLeftRight, ArrowUUpLeft, Article, Asterisk,
  Baby, Bird, BookOpen, Brain, Bread, Buildings, Butterfly, Calendar, Campfire, Cherries, Check, Church, Circle, Clock, Cloud,
  CloudSun, Coins, Crown, Cross, Diamond, Door, Drop, Ear, Eraser, Eye, Farm, Fire, FireSimple, Flame, Footprints, Gavel, Gift, Globe, Hand,
  Handshake, HandHeart, HandsPraying, Heart, Hexagon, Hourglass, House, Key, Lamp, Lifebuoy, Lightbulb, Lightning,
  Link, LinkBreak, type IconProps, MapPin, MapTrifold, Megaphone, Minus, Moon, Mountains,
  MusicNotes, Path, Peace, PersonArmsSpread, Person, PersonSimpleCircle, PintGlass, Plant, Plus, Question,
  Scales, Scroll, Seal, SealCheck, Shield, Skull, Sparkle, SpeakerHigh, Smiley, Square, Star, StarOfDavid, Sun, Sword,
  Synagogue, Target, Tent, ThumbsUp, Tree, Triangle, UsersThree, Warning, WarningDiamond, Waves, X,
} from '@phosphor-icons/react';
import type { SymbolKey } from '@/types/annotation';

type PhosphorIcon = ComponentType<IconProps>;

interface IconSpec {
  Icon: PhosphorIcon;
}

const ICON_MAP: Partial<Record<SymbolKey, IconSpec>> = {
  // Identity & deity
  triangle: { Icon: Triangle },
  cross: { Icon: Cross },
  dove: { Icon: Bird },
  flame: { Icon: Flame },
  angel: { Icon: PersonArmsSpread },
  anchor: { Icon: Anchor },
  cloud: { Icon: Cloud },

  // People & relationships
  person: { Icon: Person },
  peopleGroup: { Icon: UsersThree },
  crown: { Icon: Crown },
  prayer: { Icon: HandsPraying },
  shepherd: { Icon: Path },
  child: { Icon: Baby },
  covenant: { Icon: Handshake },

  // Obedience & freedom
  obey: { Icon: ThumbsUp },
  chains: { Icon: Link },
  liberty: { Icon: LinkBreak },

  // Concepts & themes
  star: { Icon: Star },
  heart: { Icon: Heart },
  lightning: { Icon: Lightning },
  gavel: { Icon: Gavel },
  skull: { Icon: Skull },
  sin: { Icon: ArrowFatDown },
  righteous: { Icon: ArrowFatUp },
  good: { Icon: SealCheck },
  will: { Icon: Target },
  salvation: { Icon: Lifebuoy },
  holiness: { Icon: Seal },
  forgiveness: { Icon: Eraser },
  blessing: { Icon: Gift },
  wrath: { Icon: FireSimple },
  sacrifice: { Icon: Campfire },
  resurrection: { Icon: Butterfly },
  money: { Icon: Coins },
  shield: { Icon: Shield },
  scales: { Icon: Scales },
  key: { Icon: Key },
  sun: { Icon: Sun },
  moon: { Icon: Moon },
  lamp: { Icon: Lamp },
  cup: { Icon: PintGlass },
  sword: { Icon: Sword },
  vine: { Icon: Plant },
  bread: { Icon: Bread },
  door: { Icon: Door },
  harvest: { Icon: Farm },
  fruit: { Icon: Cherries },
  warning: { Icon: Warning },
  warningDiamond: { Icon: WarningDiamond },
  idol: { Icon: PersonSimpleCircle },
  joy: { Icon: Smiley },
  peace: { Icon: Peace },
  mercy: { Icon: HandHeart },
  wisdom: { Icon: Lightbulb },
  repentance: { Icon: ArrowUUpLeft },
  praise: { Icon: MusicNotes },
  glory: { Icon: Sparkle },

  // Scripture & teaching
  scroll: { Icon: Scroll },
  book: { Icon: BookOpen },
  tablet: { Icon: Article },
  knowledge: { Icon: Brain },

  // Time & place
  clock: { Icon: Clock },
  calendar: { Icon: Calendar },
  hourglass: { Icon: Hourglass },
  arrowRight: { Icon: ArrowRight },
  arrowLeft: { Icon: ArrowLeft },
  doubleArrow: { Icon: ArrowsLeftRight },
  return: { Icon: ArrowsClockwise },

  // Geography
  mapPin: { Icon: MapPin },
  mountain: { Icon: Mountains },
  nationLand: { Icon: MapTrifold },
  globe: { Icon: Globe },
  tree: { Icon: Tree },
  river: { Icon: Waves },
  house: { Icon: House },
  tabernacle: { Icon: Tent },
  heaven: { Icon: CloudSun },
  temple: { Icon: Synagogue },
  church: { Icon: Church },
  city: { Icon: Buildings },
  starOfDavid: { Icon: StarOfDavid },

  // Actions & states
  water: { Icon: Drop },
  fire: { Icon: Fire },
  check: { Icon: Check },
  x: { Icon: X },
  hand: { Icon: Hand },
  eye: { Icon: Eye },
  mouth: { Icon: SpeakerHigh },
  ear: { Icon: Ear },
  megaphone: { Icon: Megaphone },
  foot: { Icon: Footprints },

  // Shapes
  circle: { Icon: Circle },
  square: { Icon: Square },
  diamond: { Icon: Diamond },
  hexagon: { Icon: Hexagon },
  plus: { Icon: Plus },
  minus: { Icon: Minus },

  // Punctuation
  question: { Icon: Question },
  asterisk: { Icon: Asterisk },
};

const TEXT_FALLBACK: Partial<Record<SymbolKey, string>> = {
  exclamation: '!',
  letterA: 'A', letterB: 'B', letterC: 'C', letterD: 'D', letterE: 'E', letterF: 'F',
  letterG: 'G', letterH: 'H', letterI: 'I', letterJ: 'J', letterK: 'K', letterL: 'L',
  letterM: 'M', letterN: 'N', letterO: 'O', letterP: 'P', letterQ: 'Q', letterR: 'R',
  letterS: 'S', letterT: 'T', letterU: 'U', letterV: 'V', letterW: 'W', letterX: 'X',
  letterY: 'Y', letterZ: 'Z',
  number0: '0', number1: '1', number2: '2', number3: '3', number4: '4',
  number5: '5', number6: '6', number7: '7', number8: '8', number9: '9',
};

// Back-compat: existing user data pointing to dropped keys renders as the closest surviving symbol.
const LEGACY_ALIAS: Record<string, SymbolKey> = {
  heartSparkle: 'heart',
  starOutline: 'star',
  lamb: 'cross',      // dropped: no lamb icon existed; Lamb of God → Jesus
  rock: 'mountain',   // dropped: was a duplicate of the mountain icon
};

function resolveKey(key: SymbolKey | string): SymbolKey | null {
  if (key in LEGACY_ALIAS) return LEGACY_ALIAS[key as keyof typeof LEGACY_ALIAS];
  if (key in ICON_MAP || key in TEXT_FALLBACK) return key as SymbolKey;
  return null;
}

/** React component — use in JSX contexts. */
export function SymbolIcon({
  symbol,
  size = '1em',
  color,
  className,
}: {
  symbol: SymbolKey | string;
  size?: string | number;
  color?: string;
  className?: string;
}) {
  const resolved = resolveKey(symbol);
  if (!resolved) return null;

  const spec = ICON_MAP[resolved];
  if (spec) {
    const { Icon } = spec;
    return <Icon size={size} weight="duotone" color={color} className={className} />;
  }

  const text = TEXT_FALLBACK[resolved];
  if (text) {
    return (
      <span className={className} style={{ color, fontSize: '1em', fontWeight: 600, lineHeight: 1 }}>
        {text}
      </span>
    );
  }
  return null;
}

const svgCache = new Map<SymbolKey, string>();

/** Raw markup — use in innerHTML paths (VerseText). Returns '' for unknown. */
export function getSymbolMarkup(symbol: SymbolKey | string, color?: string): string {
  const resolved = resolveKey(symbol);
  if (!resolved) return '';

  const text = TEXT_FALLBACK[resolved];
  if (text) {
    const safe = text.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
    const letterStyle = 'font-size:1em;font-weight:600;line-height:1';
    return color
      ? `<span style="color:${color};${letterStyle}">${safe}</span>`
      : `<span style="${letterStyle}">${safe}</span>`;
  }

  const spec = ICON_MAP[resolved];
  if (!spec) return '';

  let svg = svgCache.get(resolved);
  if (svg === undefined) {
    const { Icon } = spec;
    svg = renderToStaticMarkup(<Icon size="1em" weight="duotone" />);
    svgCache.set(resolved, svg);
  }
  const baseStyle = 'display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%';
  if (color) {
    return `<span style="color:${color};${baseStyle}">${svg}</span>`;
  }
  return `<span style="${baseStyle}">${svg}</span>`;
}

