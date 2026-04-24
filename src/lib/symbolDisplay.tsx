import { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Anchor, ArrowFatDown, ArrowLeft, ArrowRight, ArrowsLeftRight, ArrowUUpLeft, Article, Asterisk,
  Bird, BookOpen, Bread, Buildings, Calendar, Cherries, Check, Church, Circle, Clock, Cloud,
  Crown, Cross, Diamond, Door, Drop, Ear, Eye, Farm, Fire, Flame, Footprints, Gavel, Globe, Hand,
  HandHeart, HandsPraying, Heart, Hexagon, Hourglass, House, Key, Lamp, Lightbulb, Lightning,
  Link, LinkBreak, type IconProps, MapPin, MapTrifold, Megaphone, Minus, Moon, Mountains,
  MusicNotes, Peace, PersonArmsSpread, Person, PintGlass, Plant, Plus, Question, Scales, Scroll,
  Shield, Skull, Sparkle, SpeakerHigh, Smiley, Square, Star, Sun, Sword, Synagogue, ThumbsUp, Tree,
  Triangle, UsersThree, Warning, Waves, X,
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
  lamb: { Icon: Circle },
  anchor: { Icon: Anchor },
  cloud: { Icon: Cloud },

  // People & relationships
  person: { Icon: Person },
  peopleGroup: { Icon: UsersThree },
  crown: { Icon: Crown },
  prayer: { Icon: HandsPraying },

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
  rock: { Icon: Mountains },
  door: { Icon: Door },
  harvest: { Icon: Farm },
  fruit: { Icon: Cherries },
  warning: { Icon: Warning },
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

  // Time & place
  clock: { Icon: Clock },
  calendar: { Icon: Calendar },
  hourglass: { Icon: Hourglass },
  arrowRight: { Icon: ArrowRight },
  arrowLeft: { Icon: ArrowLeft },
  doubleArrow: { Icon: ArrowsLeftRight },

  // Geography
  mapPin: { Icon: MapPin },
  mountain: { Icon: Mountains },
  nationLand: { Icon: MapTrifold },
  globe: { Icon: Globe },
  tree: { Icon: Tree },
  river: { Icon: Waves },
  house: { Icon: House },
  temple: { Icon: Synagogue },
  church: { Icon: Church },
  city: { Icon: Buildings },

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
      <span className={className} style={{ color, fontSize: size }}>
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
    return color ? `<span style="color:${color}">${safe}</span>` : safe;
  }

  const spec = ICON_MAP[resolved];
  if (!spec) return '';

  let svg = svgCache.get(resolved);
  if (svg === undefined) {
    const { Icon } = spec;
    svg = renderToStaticMarkup(<Icon size="1.8em" weight="duotone" />);
    svgCache.set(resolved, svg);
  }
  const baseStyle = 'opacity:0.85;display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%';
  if (color) {
    return `<span style="color:${color};${baseStyle}">${svg}</span>`;
  }
  return `<span style="${baseStyle}">${svg}</span>`;
}

