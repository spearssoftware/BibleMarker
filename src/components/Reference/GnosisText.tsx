import { useBibleStore } from '@/stores/bibleStore';

interface GnosisTextProps {
  text: string;
}

const LINK_REGEX = /\[([^\]]+)\]\(\/[^#]*#([^)]+)\)/g;

function parseOsis(ref: string): { book: string; chapter: number; verse?: number } | null {
  const parts = ref.split('.');
  if (parts.length < 2) return null;
  const chapter = parseInt(parts[1], 10);
  if (isNaN(chapter)) return null;
  const verse = parts.length >= 3 ? parseInt(parts[2], 10) : undefined;
  return { book: parts[0], chapter, verse: isNaN(verse as number) ? undefined : verse };
}

export function GnosisText({ text }: GnosisTextProps) {
  const { setLocation, setNavSelectedVerse } = useBibleStore();

  const handleRefClick = (osisRef: string) => {
    const parsed = parseOsis(osisRef);
    if (!parsed) return;
    setLocation(parsed.book, parsed.chapter);
    if (parsed.verse) {
      setTimeout(() => {
        setNavSelectedVerse(parsed.verse!);
        const el = document.querySelector(`[data-verse="${parsed.verse}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setNavSelectedVerse(null), 3000);
      }, 100);
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
