/**
 * Getting Started Section Component
 *
 * Provides an overview of key features and how to use them.
 */

export function GettingStartedSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Getting Started</h3>
        <p className="text-xs text-scripture-muted mb-4">
          This app follows the Precept Bible study method, emphasizing observation through consistent marking and keyword tracking.
        </p>
        <div className="space-y-4 text-xs text-scripture-text">
          <div>
            <div className="font-medium text-scripture-text mb-2">📖 Reading the Bible</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Select a translation from the navigation bar</li>
              <li>Choose a book and chapter to read</li>
              <li>View up to 3 translations side-by-side</li>
              <li>Use arrow keys or J/K to navigate between chapters</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">✏️ Key Words — Keyword vs Variant vs Apply</div>
            <p className="text-scripture-muted mb-2">
              Three different actions, often confused. Here&rsquo;s how they differ:
            </p>
            <div className="space-y-3 text-scripture-muted">
              <div>
                <div className="font-medium text-scripture-text">🔑 Keyword</div>
                <p>A word or concept you track — gets a color and symbol, auto-highlights every match in every translation.</p>
                <p className="italic text-[11px] mt-0.5">Example: create a keyword <strong>&ldquo;God&rdquo;</strong> → every &ldquo;God&rdquo; lights up automatically wherever it appears.</p>
              </div>
              <div>
                <div className="font-medium text-scripture-text">➕ Add as Variant</div>
                <p>Expands an existing keyword so it also auto-matches another word.</p>
                <p className="italic text-[11px] mt-0.5">Example: add <strong>&ldquo;LORD&rdquo;</strong> as a variant of &ldquo;God&rdquo; → from then on, both &ldquo;God&rdquo; and &ldquo;LORD&rdquo; highlight everywhere.</p>
              </div>
              <div>
                <div className="font-medium text-scripture-text">🎯 Apply</div>
                <p>Marks <em>just this one occurrence</em> with a keyword&rsquo;s color/symbol. Does <strong>not</strong> change what the keyword matches anywhere else.</p>
                <p className="italic text-[11px] mt-0.5">Example: in &ldquo;And <strong>He</strong> spoke…&rdquo; the &ldquo;He&rdquo; refers to Jesus. Apply the Jesus keyword just to this &ldquo;He&rdquo; — not every &ldquo;He&rdquo; in the Bible refers to Jesus, so you don&rsquo;t want it as a variant.</p>
              </div>
            </div>
            <p className="text-scripture-muted mt-3">
              Open Key Words from the toolbar (✏️ or press 1), or pick one from the selection menu after selecting text. Create a study to scope keywords to a specific book or topic.
            </p>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">🔍 Observe</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Open Observe (🔍 or press 2) to capture structured study observations</li>
              <li>📝 Lists — free-form observation lists per chapter, plus people, places, and time entries</li>
              <li>💡 Conclusions — record what you learn from the chapter</li>
              <li>Click verse numbers to add inline notes (supports Markdown)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">📊 Analyze</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Open Analyze (📊 or press 3) for deeper study tools</li>
              <li>📄 Chapter — at-a-glance summary and structure</li>
              <li>📚 Overview — book-level themes and outlines</li>
              <li>📅 Timeline, 🗺️ Places, 🔍 Themes — contextual research</li>
              <li>💭 Interpret and ✍️ Apply — personal study notes</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">📖 Reference</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Open Reference (📖 from the toolbar) to look up information for what you&rsquo;re reading</li>
              <li>📖 Chapter — every person, place, topic, and event tied to the current chapter</li>
              <li>🔎 Search — find any person, place, or topic across the reference data</li>
              <li>🔤 Strong&rsquo;s — Hebrew and Greek lexicon entries (also accessible from the selection menu)</li>
              <li>א Hebrew/Greek — original-language word breakdown for the current verse</li>
              <li>🔗 Cross-Refs — cross-references for the current verse</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">🔎 Search</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Press Cmd/Ctrl+F or tap the search icon in the navigation bar</li>
              <li>Search Bible text, notes, and annotations</li>
              <li>Search by verse reference (e.g., &ldquo;John 3:16&rdquo;)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">💾 Backup & Export</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Export data backup (JSON) from Settings → Data for data recovery</li>
              <li>Export study notes (Markdown) for a readable, formatted document</li>
              <li>Save backups to cloud folders (iCloud Drive, Google Drive) for automatic syncing</li>
              <li>Restore from backups to recover your study work</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
