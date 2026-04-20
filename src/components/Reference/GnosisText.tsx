import { useBibleStore } from '@/stores/bibleStore';
import { parseOsisRef } from '@/types';

interface GnosisTextProps {
  text: string;
}

const LINK_REGEX = /\[([^\]]+)\]\(\/[^#]*#([^)]+)\)/g;

export function GnosisText({ text }: GnosisTextProps) {
  const { navigateToVerse, setLocation } = useBibleStore();

  const handleRefClick = (osisRef: string) => {
    const parsed = parseOsisRef(osisRef);
    if (!parsed) return;
    if (parsed.verse) {
      navigateToVerse(parsed.book, parsed.chapter, parsed.verse, true);
    } else {
      setLocation(parsed.book, parsed.chapter, true);
    }
  };

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_REGEX)) {
    const [fullMatch, label, osisRef] = match;
    const idx = match.index!;

    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }

    parts.push(
      <button
        key={idx}
        onClick={() => handleRefClick(osisRef)}
        className="text-scripture-accent hover:underline"
      >
        {label}
      </button>
    );

    lastIndex = idx + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) return <>{text}</>;

  return <>{parts}</>;
}
