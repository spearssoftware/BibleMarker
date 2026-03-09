import { vi } from 'vitest';

// Auto-mock for @/lib/database
// Usage: vi.mock('@/lib/database') at top of test file

export const initDatabase = vi.fn().mockResolvedValue(undefined);
export const closeDatabase = vi.fn().mockResolvedValue(undefined);
export const getSyncDiagnostics = vi.fn().mockResolvedValue({});

// Annotations
export const getChapterAnnotations = vi.fn().mockResolvedValue([]);
export const saveAnnotation = vi.fn().mockResolvedValue('ann-id');
export const deleteAnnotation = vi.fn().mockResolvedValue(undefined);
export const clearBookAnnotations = vi.fn().mockResolvedValue(0);

// Section Headings
export const getChapterHeadings = vi.fn().mockResolvedValue([]);
export const saveSectionHeading = vi.fn().mockResolvedValue('heading-id');
export const deleteSectionHeading = vi.fn().mockResolvedValue(undefined);
export const getAllSectionHeadings = vi.fn().mockResolvedValue([]);

// Chapter Titles
export const getChapterTitle = vi.fn().mockResolvedValue(undefined);
export const saveChapterTitle = vi.fn().mockResolvedValue('title-id');
export const deleteChapterTitle = vi.fn().mockResolvedValue(undefined);
export const getAllChapterTitles = vi.fn().mockResolvedValue([]);

// Notes
export const getChapterNotes = vi.fn().mockResolvedValue([]);
export const saveNote = vi.fn().mockResolvedValue('note-id');
export const deleteNote = vi.fn().mockResolvedValue(undefined);
export const getAllNotes = vi.fn().mockResolvedValue([]);

// Marking Presets
export const getAllMarkingPresets = vi.fn().mockResolvedValue([]);
export const getMarkingPreset = vi.fn().mockResolvedValue(undefined);
export const getMarkingPresetsByCategory = vi.fn().mockResolvedValue([]);
export const saveMarkingPreset = vi.fn().mockResolvedValue('preset-id');
export const deleteMarkingPreset = vi.fn().mockResolvedValue(undefined);
export const searchMarkingPresets = vi.fn().mockResolvedValue([]);
export const incrementMarkingPresetUsage = vi.fn().mockResolvedValue(undefined);

// Studies
export const getAllStudies = vi.fn().mockResolvedValue([]);
export const saveStudy = vi.fn().mockResolvedValue('study-id');
export const deleteStudy = vi.fn().mockResolvedValue(undefined);

// Preferences
export const getPreferences = vi.fn().mockResolvedValue({
  id: 'main',
  marking: {
    recentColors: [],
    recentSymbols: [],
    defaultTool: 'highlight',
    defaultColor: 'yellow',
    defaultSymbol: 'cross',
    toolbarPosition: 'bottom',
    showToolbarByDefault: true,
  },
  fontSize: 'base',
  theme: 'auto',
  favoriteTranslations: [],
  recentTranslations: [],
  onboarding: { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] },
});
export const updatePreferences = vi.fn().mockResolvedValue(undefined);

// Multi-Translation Views
export const getMultiTranslationView = vi.fn().mockResolvedValue(undefined);
export const saveMultiTranslationView = vi.fn().mockResolvedValue('view-id');
export const deleteMultiTranslationView = vi.fn().mockResolvedValue(undefined);

// Observation Data
export const getAllObservationLists = vi.fn().mockResolvedValue([]);
export const saveObservationList = vi.fn().mockResolvedValue('list-id');
export const deleteObservationList = vi.fn().mockResolvedValue(undefined);

export const getAllFiveWAndH = vi.fn().mockResolvedValue([]);
export const saveFiveWAndH = vi.fn().mockResolvedValue('entry-id');
export const deleteFiveWAndH = vi.fn().mockResolvedValue(undefined);

export const getAllContrasts = vi.fn().mockResolvedValue([]);
export const saveContrast = vi.fn().mockResolvedValue('contrast-id');
export const deleteContrast = vi.fn().mockResolvedValue(undefined);

export const getAllTimeExpressions = vi.fn().mockResolvedValue([]);
export const saveTimeExpression = vi.fn().mockResolvedValue('time-id');
export const deleteTimeExpression = vi.fn().mockResolvedValue(undefined);

export const getAllPlaces = vi.fn().mockResolvedValue([]);
export const savePlace = vi.fn().mockResolvedValue('place-id');
export const deletePlace = vi.fn().mockResolvedValue(undefined);

export const getAllPeople = vi.fn().mockResolvedValue([]);
export const savePerson = vi.fn().mockResolvedValue('person-id');
export const deletePerson = vi.fn().mockResolvedValue(undefined);

export const getAllConclusions = vi.fn().mockResolvedValue([]);
export const saveConclusion = vi.fn().mockResolvedValue('conclusion-id');
export const deleteConclusion = vi.fn().mockResolvedValue(undefined);

export const getAllInterpretations = vi.fn().mockResolvedValue([]);
export const saveInterpretation = vi.fn().mockResolvedValue('interp-id');
export const deleteInterpretation = vi.fn().mockResolvedValue(undefined);

export const getAllApplications = vi.fn().mockResolvedValue([]);
export const saveApplication = vi.fn().mockResolvedValue('app-id');
export const deleteApplication = vi.fn().mockResolvedValue(undefined);

// Clear
export const clearDatabase = vi.fn().mockResolvedValue(undefined);

// Export/Import
export const exportAllData = vi.fn().mockResolvedValue({
  annotations: [],
  sectionHeadings: [],
  chapterTitles: [],
  notes: [],
  markingPresets: [],
  studies: [],
  multiTranslationViews: [],
  observationLists: [],
  fiveWAndH: [],
  contrasts: [],
  timeExpressions: [],
  places: [],
  people: [],
  conclusions: [],
  interpretations: [],
  applications: [],
  preferences: null,
});
export const importAllData = vi.fn().mockResolvedValue(undefined);

// Cache
export const getCachedChapter = vi.fn().mockResolvedValue(undefined);
export const setCachedChapter = vi.fn().mockResolvedValue(undefined);
export const getAllCachedChapters = vi.fn().mockResolvedValue([]);
export const getBookChapterTitles = vi.fn().mockResolvedValue([]);
export const getBookSectionHeadings = vi.fn().mockResolvedValue([]);
export const getBookCachedChapters = vi.fn().mockResolvedValue(new Map());
export const clearChapterCache = vi.fn().mockResolvedValue(undefined);
export const getCachedTranslations = vi.fn().mockResolvedValue(undefined);
export const setCachedTranslations = vi.fn().mockResolvedValue(undefined);

// ESV Rate Limit
export const getEsvRateLimitState = vi.fn().mockResolvedValue({ requestTimestamps: [] });
export const saveEsvRateLimitState = vi.fn().mockResolvedValue(undefined);

// Reading History
export const addReadingHistory = vi.fn().mockResolvedValue(undefined);

// Raw SQL
export const sqlSelect = vi.fn().mockResolvedValue([]);
export const sqlExecute = vi.fn().mockResolvedValue(undefined);

/** Reset all mock functions to their defaults */
export function resetMockDatabase(): void {
  const allMocks = [
    initDatabase, closeDatabase, getSyncDiagnostics,
    getChapterAnnotations, saveAnnotation, deleteAnnotation, clearBookAnnotations,
    getChapterHeadings, saveSectionHeading, deleteSectionHeading, getAllSectionHeadings,
    getChapterTitle, saveChapterTitle, deleteChapterTitle, getAllChapterTitles,
    getChapterNotes, saveNote, deleteNote, getAllNotes,
    getAllMarkingPresets, getMarkingPreset, getMarkingPresetsByCategory,
    saveMarkingPreset, deleteMarkingPreset, searchMarkingPresets, incrementMarkingPresetUsage,
    getAllStudies, saveStudy, deleteStudy,
    getPreferences, updatePreferences,
    getMultiTranslationView, saveMultiTranslationView, deleteMultiTranslationView,
    getAllObservationLists, saveObservationList, deleteObservationList,
    getAllFiveWAndH, saveFiveWAndH, deleteFiveWAndH,
    getAllContrasts, saveContrast, deleteContrast,
    getAllTimeExpressions, saveTimeExpression, deleteTimeExpression,
    getAllPlaces, savePlace, deletePlace,
    getAllPeople, savePerson, deletePerson,
    getAllConclusions, saveConclusion, deleteConclusion,
    getAllInterpretations, saveInterpretation, deleteInterpretation,
    getAllApplications, saveApplication, deleteApplication,
    clearDatabase, exportAllData, importAllData,
    getCachedChapter, setCachedChapter, getAllCachedChapters,
    getBookChapterTitles, getBookSectionHeadings, getBookCachedChapters,
    clearChapterCache, getCachedTranslations, setCachedTranslations,
    getEsvRateLimitState, saveEsvRateLimitState,
    addReadingHistory, sqlSelect, sqlExecute,
  ];
  for (const mock of allMocks) {
    mock.mockReset();
  }
}
