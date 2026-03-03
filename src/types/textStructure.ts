export type ConjunctionCategory =
  | 'time'
  | 'place'
  | 'reason'
  | 'result'
  | 'explanation'
  | 'purpose'
  | 'contrast'
  | 'comparison'
  | 'continuation'
  | 'concession'
  | 'condition'
  | 'emphatic';

export interface DetectedConjunction {
  word: string;
  category: ConjunctionCategory;
  offset: number;
}

export interface StructureLine {
  id: string;
  text: string;
  indent: number;
  verseNumber: number;
  sourceOffset: number;
  conjunction?: DetectedConjunction;
  order: number;
}

export interface TextStructure {
  id: string;
  moduleId: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  lines: StructureLine[];
  studyId?: string;
  createdAt: Date;
  updatedAt: Date;
}
