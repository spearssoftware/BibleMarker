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
            <div className="font-medium text-scripture-text mb-2">✏️ Marking Text</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Select text to open the selection menu: apply keywords, add variants, or add to observation lists</li>
              <li>All markings use keywords for consistency across translations</li>
              <li>Keywords automatically highlight matching text in all visible translations</li>
              <li>Press 1–3 for Mark, Observe, Analyze</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">✏️ Key Words</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Define key words (e.g., "God", "Jesus", "love") with colors and symbols</li>
              <li>Key words automatically highlight across all visible translations</li>
              <li>Create studies to scope keywords to specific books</li>
              <li>Access Key Words from the toolbar (✏️ or press 1) or from the selection menu</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">🔍 Observe</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Open Observe (🔍 or press 2) to capture structured study observations</li>
              <li>📝 Lists — free-form observation lists per chapter</li>
              <li>❓ 5 W's & H — Who, What, When, Where, Why, How questions</li>
              <li>⇔ Contrasts, 🕐 Time, 📍 Places, 👤 People — categorized lists</li>
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
            <div className="font-medium text-scripture-text mb-2">🔎 Search</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Press Cmd/Ctrl+F or tap the search icon in the navigation bar</li>
              <li>Search Bible text, notes, and annotations</li>
              <li>Search by verse reference (e.g., "John 3:16")</li>
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
