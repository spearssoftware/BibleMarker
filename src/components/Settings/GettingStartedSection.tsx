/**
 * Getting Started Section Component
 * 
 * Provides an overview of key features and how to use them.
 */

export function GettingStartedSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-ui font-semibold text-scripture-text mb-3">Getting Started</h3>
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
            <div className="font-medium text-scripture-text mb-2">🖍️ Marking Text</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Select text to highlight, color, underline, or add symbols</li>
              <li>Use the toolbar at the bottom to choose marking tools</li>
              <li>Previous markings are suggested when you select similar text</li>
              <li>Press number keys 1-6 to quickly access toolbar tools</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">🔑 Key Words</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Define key words (e.g., "God", "Jesus", "love") with colors and symbols</li>
              <li>Key words automatically highlight across all visible translations</li>
              <li>Create studies to scope keywords to specific books</li>
              <li>Access Key Words from the toolbar (🔑 icon or press 4)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">📝 Notes & Observations</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Click verse numbers to add notes (supports Markdown)</li>
              <li>Create observation lists linked to key words</li>
              <li>Add section headings and chapter titles</li>
              <li>View summaries in Study Tools (📚 icon or press 5)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">🔍 Search</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Press Cmd/Ctrl+F or click the search icon</li>
              <li>Search Bible text, notes, and annotations</li>
              <li>Search by verse reference (e.g., "John 3:16")</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-2">💾 Backup & Restore</div>
            <ul className="space-y-1.5 text-scripture-muted ml-4 list-disc">
              <li>Export all your data from Settings → Data</li>
              <li>Save backups to cloud folders (iCloud Drive, Google Drive) for automatic syncing</li>
              <li>Restore from backups to recover your study work</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
