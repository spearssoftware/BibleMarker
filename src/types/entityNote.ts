export type EntityNoteType = 'person' | 'place' | 'event' | 'topic';

export interface EntityNote {
  id: string;
  entityType: EntityNoteType;
  entitySlug: string;
  entityName: string;
  content: string;
  studyId?: string;
  createdAt: Date;
  updatedAt: Date;
}
