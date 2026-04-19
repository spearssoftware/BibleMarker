import { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Anchor, ArrowFatDown, ArrowLeft, ArrowRight, ArrowsLeftRight, Article, Asterisk,
  Bird, BookOpen, Bread, Buildings, Calendar, Cherries, Check, Church, Circle, Clock, Cloud,
  Crown, Cross, Diamond, Door, Drop, Ear, Eye, Farm, Fire, Flame, Footprints, Globe, Hand,
  HandsPraying, Heart, Hexagon, Hourglass, House, Key, Lamp, Lightning, Link, LinkBreak,
  type IconProps, MapPin, MapTrifold, Megaphone, Minus, Moon, Mountains, PersonArmsSpread,
  Person, PintGlass, Plant, Plus, Question, Scales, Scroll, Shield, Skull, SpeakerHigh,
  Smiley, Square, Star, Sun, Sword, Synagogue, ThumbsUp, Tree, Triangle, UsersThree, Warning, Waves, X,
} from '@phosphor-icons/react';
import type { SymbolKey } from '@/types/annotation';

type PhosphorIcon = ComponentType<IconProps>;

interface IconSpec {
  Icon: PhosphorIcon;
  weight?: IconProps['weight'];
}

const ICON_MAP: Partial<Record<SymbolKey, IconSpec>> = {
  // Identity & deity
  triangle: { Icon: Triangle, weight: 'fill' },
  cross: { Icon: Cross, weight: 'fill' },
  dove: { Icon: Bird, weight: 'fill' },
  flame: { Icon: Flame, weight: 'fill' },
  angel: { Icon: PersonArmsSpread, weight: 'fill' },
  lamb: { Icon: Circle, weight: 'fill' },
  anchor: { Icon: Anchor, weight: 'fill' },
  cloud: { Icon: Cloud, weight: 'fill' },

  // People & relationships
  person: { Icon: Person, weight: 'fill' },
  peopleGroup: { Icon: UsersThree, weight: 'fill' },
  crown: { Icon: Crown, weight: 'fill' },
  prayer: { Icon: HandsPraying, weight: 'fill' },

  // Obedience & freedom
  obey: { Icon: ThumbsUp, weight: 'fill' },
  chains: { Icon: Link, weight: 'bold' },
  liberty: { Icon: LinkBreak, weight: 'bold' },

  // Concepts & themes
  star: { Icon: Star, weight: 'fill' },
  starOutline: { Icon: Star, weight: 'regular' },
  heart: { Icon: Heart, weight: 'fill' },
  lightning: { Icon: Lightning, weight: 'fill' },
  skull: { Icon: Skull, weight: 'fill' },
  sin: { Icon: ArrowFatDown, weight: 'fill' },
  shield: { Icon: Shield, weight: 'fill' },
  scales: { Icon: Scales, weight: 'fill' },
  key: { Icon: Key, weight: 'fill' },
  sun: { Icon: Sun, weight: 'fill' },
  moon: { Icon: Moon, weight: 'fill' },
  lamp: { Icon: Lamp, weight: 'fill' },
  cup: { Icon: PintGlass, weight: 'fill' },
  sword: { Icon: Sword, weight: 'fill' },
  vine: { Icon: Plant, weight: 'fill' },
  bread: { Icon: Bread, weight: 'fill' },
  rock: { Icon: Mountains, weight: 'fill' },
  door: { Icon: Door, weight: 'fill' },
  harvest: { Icon: Farm, weight: 'fill' },
  fruit: { Icon: Cherries, weight: 'fill' },
  warning: { Icon: Warning, weight: 'fill' },
  joy: { Icon: Smiley, weight: 'fill' },

  // Scripture & teaching
  scroll: { Icon: Scroll, weight: 'fill' },
  book: { Icon: BookOpen, weight: 'fill' },
  tablet: { Icon: Article, weight: 'fill' },

  // Time & place
  clock: { Icon: Clock, weight: 'fill' },
  calendar: { Icon: Calendar, weight: 'fill' },
  hourglass: { Icon: Hourglass, weight: 'fill' },
  arrowRight: { Icon: ArrowRight, weight: 'bold' },
  arrowLeft: { Icon: ArrowLeft, weight: 'bold' },
  doubleArrow: { Icon: ArrowsLeftRight, weight: 'bold' },

  // Geography
  mapPin: { Icon: MapPin, weight: 'fill' },
  mountain: { Icon: Mountains, weight: 'fill' },
  nationLand: { Icon: MapTrifold, weight: 'fill' },
  globe: { Icon: Globe, weight: 'fill' },
  tree: { Icon: Tree, weight: 'fill' },
  river: { Icon: Waves, weight: 'bold' },
  house: { Icon: House, weight: 'fill' },
  temple: { Icon: Synagogue, weight: 'fill' },
  church: { Icon: Church, weight: 'fill' },
  city: { Icon: Buildings, weight: 'fill' },

  // Actions & states
  water: { Icon: Drop, weight: 'fill' },
  fire: { Icon: Fire, weight: 'fill' },
  check: { Icon: Check, weight: 'bold' },
  x: { Icon: X, weight: 'bold' },
  hand: { Icon: Hand, weight: 'fill' },
  eye: { Icon: Eye, weight: 'fill' },
  mouth: { Icon: SpeakerHigh, weight: 'fill' },
  ear: { Icon: Ear, weight: 'fill' },
  megaphone: { Icon: Megaphone, weight: 'fill' },
  foot: { Icon: Footprints, weight: 'fill' },

  // Shapes
  circle: { Icon: Circle, weight: 'fill' },
  square: { Icon: Square, weight: 'fill' },
  diamond: { Icon: Diamond, weight: 'fill' },
  hexagon: { Icon: Hexagon, weight: 'fill' },
  plus: { Icon: Plus, weight: 'bold' },
  minus: { Icon: Minus, weight: 'bold' },

  // Punctuation
  question: { Icon: Question, weight: 'bold' },
  asterisk: { Icon: Asterisk, weight: 'bold' },
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
    const { Icon, weight } = spec;
    return <Icon size={size} weight={weight ?? 'fill'} color={color} className={className} />;
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
    const { Icon, weight } = spec;
    svg = renderToStaticMarkup(<Icon size="1em" weight={weight ?? 'fill'} />);
    svgCache.set(resolved, svg);
  }
  if (color) {
    // Inject fill color — Phosphor SVGs use currentColor by default, so wrapping with color works.
    return `<span style="color:${color};display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%">${svg}</span>`;
  }
  return svg;
}

