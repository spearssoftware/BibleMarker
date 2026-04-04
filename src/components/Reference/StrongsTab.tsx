import { useState } from 'react';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { Input, Button } from '@/components/shared';

export function StrongsTab() {
  const [inputValue, setInputValue] = useState('');
  const [number, setNumber] = useState('');

  const { data: entry, isLoading, error } = useGnosisEntity(
    (p) => number ? p.getStrongsEntry(number) : Promise.resolve(null),
    [number]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNumber(inputValue.trim().toUpperCase());
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder="H1, G3056..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <Button type="submit" variant="primary" size="sm" disabled={!inputValue.trim()}>
          Look up
        </Button>
      </form>

      {isLoading && <p className="text-sm text-scripture-muted">Loading...</p>}

      {error && <p className="text-sm text-scripture-error">{error}</p>}

      {entry && (
        <div className="space-y-3 p-3 rounded-lg bg-scripture-elevated border border-scripture-border/30">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-scripture-accent font-mono">{entry.number}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-scripture-border/50 text-scripture-muted">
              {entry.language === 'H' ? 'Hebrew' : 'Greek'}
            </span>
          </div>

          {entry.lemma && (
            <p className="text-lg font-semibold text-scripture-text">{entry.lemma}</p>
          )}

          {(entry.transliteration || entry.pronunciation) && (
            <p className="text-sm text-scripture-muted italic">
              {entry.transliteration}
              {entry.transliteration && entry.pronunciation && ' · '}
              {entry.pronunciation}
            </p>
          )}

          {entry.definition && (
            <div>
              <h4 className="text-xs font-medium text-scripture-muted uppercase tracking-wide mb-1">Definition</h4>
              <p className="text-sm text-scripture-text leading-relaxed">{entry.definition}</p>
            </div>
          )}

          {entry.kjvUsage && (
            <div>
              <h4 className="text-xs font-medium text-scripture-muted uppercase tracking-wide mb-1">KJV Usage</h4>
              <p className="text-sm text-scripture-text">{entry.kjvUsage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
