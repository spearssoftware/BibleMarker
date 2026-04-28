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
            <div className="font-medium text-scripture-text mb-2">✏️ Key Words</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Define key words (e.g., &ldquo;God&rdquo;, &ldquo;Jesus&rdquo;, &ldquo;love&rdquo;) with a color and symbol — they auto-highlight in every visible translation</li>
              <li><strong>Add as Variant</strong> — expand which words a keyword matches across the text (e.g. add &ldquo;Lord&rdquo; as a variant of &ldquo;God&rdquo; so both highlight)</li>
              <li><strong>Apply</strong> — mark just the selected occurrence with a keyword&rsquo;s color/symbol without making it a new variant. Useful for pronouns like &ldquo;He&rdquo; or &ldquo;Him&rdquo; that refer to a keyword but shouldn&rsquo;t auto-match everywhere</li>
              <li>Create a study to scope keywords to a specific book or topic</li>
              <li>Access from the toolbar (✏️ or press 1) or from the selection menu</li>
            </ul>
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
