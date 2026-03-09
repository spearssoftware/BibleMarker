import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStudyStore } from '@/stores/studyStore';
import { getAllStudies, saveStudy, deleteStudy } from '@/lib/database';
import { makeStudy } from '@/lib/__test__/factories';

vi.mock('@/lib/database');

describe('studyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudyStore.setState({
      activeStudyId: null,
      studies: [],
    });
  });

  describe('loadStudies', () => {
    it('populates state from DB', async () => {
      const studies = [makeStudy({ id: 's1' }), makeStudy({ id: 's2' })];
      vi.mocked(getAllStudies).mockResolvedValue(studies);

      await useStudyStore.getState().loadStudies();

      expect(useStudyStore.getState().studies).toEqual(studies);
    });

    it('finds active study and sets activeStudyId', async () => {
      const studies = [
        makeStudy({ id: 's1', isActive: false }),
        makeStudy({ id: 's2', isActive: true }),
      ];
      vi.mocked(getAllStudies).mockResolvedValue(studies);

      await useStudyStore.getState().loadStudies();

      expect(useStudyStore.getState().activeStudyId).toBe('s2');
    });

    it('sets activeStudyId to null when no active study', async () => {
      vi.mocked(getAllStudies).mockResolvedValue([makeStudy({ isActive: false })]);

      await useStudyStore.getState().loadStudies();

      expect(useStudyStore.getState().activeStudyId).toBeNull();
    });
  });

  describe('createStudy', () => {
    it('generates UUID, saves to DB, appends to state', async () => {
      vi.mocked(saveStudy).mockResolvedValue('id');

      const result = await useStudyStore.getState().createStudy('My Study');

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Study');
      expect(saveStudy).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Study' }));
      expect(useStudyStore.getState().studies).toHaveLength(1);
    });

    it('sets isActive to false by default', async () => {
      vi.mocked(saveStudy).mockResolvedValue('id');

      const result = await useStudyStore.getState().createStudy('Study');

      expect(result.isActive).toBe(false);
    });

    it('accepts optional book parameter', async () => {
      vi.mocked(saveStudy).mockResolvedValue('id');

      const result = await useStudyStore.getState().createStudy('John Study', 'John');

      expect(result.book).toBe('John');
    });
  });

  describe('updateStudy', () => {
    it('saves with new updatedAt and updates in state', async () => {
      const study = makeStudy({ id: 's1', name: 'Original' });
      useStudyStore.setState({ studies: [study] });
      vi.mocked(saveStudy).mockResolvedValue('s1');

      const updated = { ...study, name: 'Updated' };
      await useStudyStore.getState().updateStudy(updated);

      expect(saveStudy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));
      expect(useStudyStore.getState().studies[0].name).toBe('Updated');
    });

    it('sets activeStudyId when study.isActive is true', async () => {
      const study = makeStudy({ id: 's1', isActive: false });
      useStudyStore.setState({ studies: [study], activeStudyId: null });
      vi.mocked(saveStudy).mockResolvedValue('s1');

      await useStudyStore.getState().updateStudy({ ...study, isActive: true });

      expect(useStudyStore.getState().activeStudyId).toBe('s1');
    });
  });

  describe('deleteStudy', () => {
    it('removes from DB and state', async () => {
      useStudyStore.setState({ studies: [makeStudy({ id: 's1' })] });
      vi.mocked(deleteStudy).mockResolvedValue(undefined);

      await useStudyStore.getState().deleteStudy('s1');

      expect(deleteStudy).toHaveBeenCalledWith('s1');
      expect(useStudyStore.getState().studies).toHaveLength(0);
    });

    it('clears activeStudyId if matching', async () => {
      useStudyStore.setState({
        studies: [makeStudy({ id: 's1' })],
        activeStudyId: 's1',
      });
      vi.mocked(deleteStudy).mockResolvedValue(undefined);

      await useStudyStore.getState().deleteStudy('s1');

      expect(useStudyStore.getState().activeStudyId).toBeNull();
    });

    it('preserves activeStudyId if not matching', async () => {
      useStudyStore.setState({
        studies: [makeStudy({ id: 's1' }), makeStudy({ id: 's2' })],
        activeStudyId: 's2',
      });
      vi.mocked(deleteStudy).mockResolvedValue(undefined);

      await useStudyStore.getState().deleteStudy('s1');

      expect(useStudyStore.getState().activeStudyId).toBe('s2');
    });
  });

  describe('setActiveStudy', () => {
    it('marks one active and saves all to DB', async () => {
      const studies = [makeStudy({ id: 's1' }), makeStudy({ id: 's2' })];
      useStudyStore.setState({ studies });
      vi.mocked(saveStudy).mockResolvedValue('id');

      await useStudyStore.getState().setActiveStudy('s1');

      expect(useStudyStore.getState().activeStudyId).toBe('s1');
      const updated = useStudyStore.getState().studies;
      expect(updated.find(s => s.id === 's1')?.isActive).toBe(true);
      expect(updated.find(s => s.id === 's2')?.isActive).toBe(false);
      expect(saveStudy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveStudy', () => {
    it('returns the active study', () => {
      const study = makeStudy({ id: 's1' });
      useStudyStore.setState({ studies: [study], activeStudyId: 's1' });

      expect(useStudyStore.getState().getActiveStudy()).toEqual(study);
    });

    it('returns null when no active study', () => {
      useStudyStore.setState({ studies: [], activeStudyId: null });

      expect(useStudyStore.getState().getActiveStudy()).toBeNull();
    });
  });
});
