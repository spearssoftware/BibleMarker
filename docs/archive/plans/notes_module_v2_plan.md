# Notes Module v2 - Project Plan

## Overview

Add a standalone notes module that allows users to create free-form notes not tied to specific Bible verses. This complements the existing verse-attached notes system and provides a space for general journaling, reflection, and study notes.

## Current State

The app currently has:
- **Verse Notes**: Notes attached to specific verses or verse ranges (`Note` interface with `ref: VerseRef`)
- Notes are created via verse number menu
- Notes support markdown content
- Notes are searchable via the search feature

## New Requirements

### Core Features

1. **Free-Form Notes**: Notes that are not tied to any specific verse or text selection
2. **Templates**: Pre-defined note templates to guide users
   - **Writing Prompts**: Templates with prompts/questions to guide reflection
   - **Verse of the Day**: Template that includes a verse and prompts for notes about it

### User Stories

- As a user, I want to create general study notes that aren't tied to a specific verse
- As a user, I want to use templates to guide my note-taking
- As a user, I want to see a "Verse of the Day" with prompts to help me reflect
- As a user, I want to browse and search all my free-form notes
- As a user, I want to organize notes by tags or categories
- As a user, I want to link free-form notes to verses or other notes

---

## Phase 1: Data Model & Storage

### New Types

```typescript
// src/types/note.ts

/** Free-form note (not tied to verses) */
export interface FreeFormNote {
  id: string;
  
  // Content
  title: string;              // Note title (required)
  content: string;            // Markdown content
  tags: string[];             // User-defined tags for organization
  
  // Optional links
  linkedVerses?: VerseRef[];  // Optional: link to verses for reference
  linkedNoteIds?: string[];   // Optional: link to other notes
  
  // Template info
  templateId?: string;        // If created from a template
  templateData?: Record<string, any>; // Template-specific data
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;         // Soft delete / archive
}

/** Note template definition */
export interface NoteTemplate {
  id: string;
  name: string;               // Display name (e.g., "Daily Reflection")
  description?: string;        // Template description
  category: 'prompt' | 'verse-of-day' | 'custom';
  
  // Template structure
  titleTemplate?: string;      // Template for title (can include variables)
  contentTemplate: string;     // Template for content (markdown, can include prompts/variables)
  
  // For verse-of-day templates
  verseOfDayConfig?: {
    autoFetch: boolean;        // Auto-fetch verse of the day
    source?: 'random' | 'reading-plan' | 'custom';
  };
  
  // Template variables (for dynamic content)
  variables?: TemplateVariable[];
  
  createdAt: Date;
  updatedAt: Date;
}

/** Template variable definition */
export interface TemplateVariable {
  name: string;               // Variable name (e.g., "verse", "date")
  type: 'text' | 'verse' | 'date' | 'prompt';
  defaultValue?: string;
  prompt?: string;            // For prompt-type variables
}

/** Writing prompt template */
export interface WritingPrompt {
  id: string;
  title: string;
  prompt: string;            // The question/prompt text
  category?: string;         // e.g., "reflection", "application", "prayer"
  suggestedLength?: number;  // Suggested word count
}
```

### Database Schema

Add to `src/lib/db.ts`:

```typescript
// New tables
freeFormNotes!: EntityTable<FreeFormNote, 'id'>;
noteTemplates!: EntityTable<NoteTemplate, 'id'>;
writingPrompts!: EntityTable<WritingPrompt, 'id'>;

// Indexes for freeFormNotes
freeFormNotes: 'id, createdAt, updatedAt, archivedAt, [tags]'

// Indexes for noteTemplates
noteTemplates: 'id, category'

// Indexes for writingPrompts
writingPrompts: 'id, category'
```

### Database Migration

- Add version 8 migration to Dexie schema
- Add new tables: `freeFormNotes`, `noteTemplates`, `writingPrompts`
- Create indexes for efficient querying (by date, tags, etc.)

---

## Phase 2: Note Templates System

### Built-in Templates

#### 1. Writing Prompts Template

**Template: "Daily Reflection"**
- Title: "Daily Reflection - {date}"
- Content template with prompts:
  ```
  ## What I Read Today
  [Your reading notes here]
  
  ## Key Insights
  - What stood out to me?
  - What did I learn?
  
  ## Application
  - How does this apply to my life?
  - What will I do differently?
  
  ## Prayer
  [Your prayer notes]
  ```

**Template: "Study Notes"**
- Title: "Study Notes - {topic}"
- Content template:
  ```
  ## Topic
  [Topic name]
  
  ## Observations
  [Your observations]
  
  ## Questions
  [Questions to explore]
  
  ## Cross-References
  [Related verses]
  
  ## Summary
  [Your summary]
  ```

#### 2. Verse of the Day Template

**Template: "Verse of the Day Reflection"**
- Auto-fetches a verse (random from user's reading history, or from a reading plan)
- Title: "Verse of the Day - {date}"
- Content template:
  ```
  ## Verse of the Day
  > {verse_text}
  > 
  > — {verse_reference}
  
  ## Reflection Prompts
  1. What does this verse mean to me?
  2. How does this apply to my current situation?
  3. What action will I take based on this verse?
  
  ## My Thoughts
  [Your reflection]
  
  ## Prayer
  [Your prayer]
  ```

### Template Engine

Create `src/lib/templateEngine.ts`:
- Parse template strings with variables (e.g., `{date}`, `{verse_text}`)
- Replace variables with actual values
- Support conditional sections
- Handle verse fetching for verse-of-day templates

### Default Templates

Pre-populate database with built-in templates on first use:
- Daily Reflection
- Study Notes
- Verse of the Day Reflection
- Prayer Journal
- Sermon Notes

---

## Phase 3: UI Components

### Notes Manager Panel

**Component**: `src/components/Notes/NotesManager.tsx`

Features:
- List view of all free-form notes (sorted by date, title, or tags)
- Search/filter by title, content, tags
- Create new note button
- Template selector when creating new note
- Archive/delete notes
- Tag management

**Layout**:
- Sidebar or panel (similar to Study Tools Panel)
- List of notes on left, note editor on right (or full-screen editor)
- Filter bar at top (search, tag filter, date range)

### Note Editor

**Component**: `src/components/Notes/NoteEditor.tsx`

Features:
- Rich text editor (markdown support)
- Title input
- Tag input (autocomplete from existing tags)
- Link verses button (opens verse picker)
- Link notes button (opens note picker)
- Template selector (when creating)
- Save/Cancel buttons
- Delete/Archive buttons

**Markdown Support**:
- Use existing markdown rendering (if available)
- Or integrate a markdown editor library (e.g., `react-markdown`, `@uiw/react-md-editor`)

### Template Selector

**Component**: `src/components/Notes/TemplateSelector.tsx`

Features:
- Grid/list of available templates
- Preview of template structure
- "Create from Template" button
- "Create Blank Note" option
- Categories: Prompts, Verse of Day, Custom

### Verse of the Day Component

**Component**: `src/components/Notes/VerseOfTheDay.tsx`

Features:
- Display today's verse (fetched from reading history or random)
- "Create Note from Verse" button
- Auto-updates daily
- Optional: Reading plan integration (future)

### Writing Prompts Component

**Component**: `src/components/Notes/WritingPrompts.tsx`

Features:
- List of available writing prompts
- Filter by category
- "Use Prompt" button to create note with prompt
- Can be integrated into template system

---

## Phase 4: Integration Points

### Toolbar Integration

Add "Notes" button to `MarkingToolbar`:
- Icon: 📝 or 📓
- Opens Notes Manager panel
- Keyboard shortcut: `Cmd/Ctrl+N` (or `Cmd/Ctrl+Shift+N` if `N` conflicts)

### Search Integration

Update `src/lib/search.ts`:
- Add `searchFreeFormNotes()` function
- Include free-form notes in "All" search scope
- Show note type indicator in results (📝 for verse notes, 📓 for free-form notes)

### Study Tools Panel Integration

Optional: Add "Notes" tab to Study Tools Panel:
- Shows notes related to current book/chapter (via linked verses)
- Or shows all notes with filter by book

### Navigation

- Add Notes to main navigation (if there is one)
- Or accessible via toolbar button
- Breadcrumb: Notes → [Note Title]

---

## Phase 5: Advanced Features (Post-MVP)

### Note Organization

- **Folders/Notebooks**: Organize notes into folders
- **Tags**: Enhanced tag system with tag colors, tag groups
- **Starred Notes**: Mark important notes
- **Note Links**: Bidirectional linking between notes

### Export

- Export notes as markdown files
- Export notes as PDF
- Export by tag/folder
- Include linked verses in export

### Templates Marketplace

- User-created templates
- Share templates
- Import/export templates

### Verse Integration

- Auto-link verses mentioned in notes (detect verse references)
- Verse reference picker with autocomplete
- Display linked verses in note view

### Rich Media

- Image attachments
- Audio recordings
- File attachments

---

## Implementation Plan

### Step 1: Data Layer (Week 1)
- [ ] Create `src/types/note.ts` with type definitions
- [ ] Add database tables and migration
- [ ] Create `src/stores/noteStore.ts` for state management
- [ ] Add CRUD functions to `src/lib/db.ts`

### Step 2: Template System (Week 1-2)
- [ ] Create `src/lib/templateEngine.ts`
- [ ] Create default templates
- [ ] Implement verse-of-day fetching logic
- [ ] Create template management functions

### Step 3: Core UI (Week 2-3)
- [ ] Create `src/components/Notes/NotesManager.tsx`
- [ ] Create `src/components/Notes/NoteEditor.tsx`
- [ ] Create `src/components/Notes/TemplateSelector.tsx`
- [ ] Create `src/components/Notes/VerseOfTheDay.tsx`
- [ ] Style components to match app theme

### Step 4: Integration (Week 3)
- [ ] Add Notes button to toolbar
- [ ] Integrate with search
- [ ] Add keyboard shortcuts
- [ ] Update backup/restore to include free-form notes

### Step 5: Polish & Testing (Week 4)
- [ ] Add loading states
- [ ] Error handling
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Mobile responsiveness
- [ ] User testing

---

## File Structure

```
src/
├── types/
│   └── note.ts                    # FreeFormNote, NoteTemplate, WritingPrompt types
├── stores/
│   └── noteStore.ts               # Zustand store for notes state
├── lib/
│   ├── db.ts                      # Updated with new tables
│   ├── templateEngine.ts          # Template parsing and rendering
│   └── verseOfDay.ts              # Verse of the day fetching logic
├── components/
│   └── Notes/
│       ├── NotesManager.tsx        # Main notes panel
│       ├── NoteEditor.tsx          # Note editor component
│       ├── NoteList.tsx            # List view of notes
│       ├── NoteCard.tsx            # Individual note card
│       ├── TemplateSelector.tsx    # Template selection UI
│       ├── VerseOfTheDay.tsx       # Verse of the day component
│       ├── WritingPrompts.tsx      # Writing prompts component
│       ├── TagInput.tsx            # Tag input with autocomplete
│       ├── VerseLinker.tsx         # Link verses to note
│       └── index.ts                # Exports
└── lib/
    └── templates/
        ├── defaultTemplates.ts     # Default template definitions
        └── writingPrompts.ts      # Default writing prompts
```

---

## Design Considerations

### Naming

- **Free-Form Notes** vs **Verse Notes**: Clear distinction in UI
- Consider renaming existing `Note` to `VerseNote` for clarity (breaking change, consider for v2.1)

### User Experience

- **Quick Create**: Floating action button for quick note creation
- **Recent Templates**: Show recently used templates first
- **Drafts**: Auto-save drafts as user types
- **Offline Support**: All notes stored locally in IndexedDB

### Performance

- **Lazy Loading**: Load note content on demand (list view shows title/preview only)
- **Virtual Scrolling**: For large note lists
- **Debounced Search**: Search as user types

### Accessibility

- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Proper ARIA labels
- **Focus Management**: Proper focus handling in modals

---

## Success Metrics

- Users can create free-form notes without verse context
- Users can use templates to guide note-taking
- Verse of the day feature is used regularly
- Notes are searchable and organized
- Integration with existing features is seamless

---

## Future Enhancements (Post-v2)

- **Sync**: Cloud sync for notes (if cloud sync is added)
- **Collaboration**: Share notes with others
- **AI Integration**: AI-powered writing prompts or note suggestions
- **Reading Plans**: Integrate with reading plans for verse-of-day
- **Reminders**: Daily reminder to write notes
- **Statistics**: Note writing streaks, word counts, etc.
