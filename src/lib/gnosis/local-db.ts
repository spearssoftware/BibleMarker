/**
 * Gnosis Local DB Adapter
 *
 * Implements GnosisDataProvider by querying a bundled gnosis-lite.db file.
 * The DB is copied from Tauri resources on first use via install_bundled_module.
 */

import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import type { GnosisDataProvider } from './provider';
import type {
  ChapterEntities,
  GnosisCrossReference,
  GnosisDictionaryEntry,
  GnosisDictionaryDefinition,
  GnosisEvent,
  GnosisGreekLexiconEntry,
  GnosisGreekWord,
  GnosisHebrewWord,
  GnosisLexiconEntry,
  GnosisMeta,
  GnosisPeopleGroup,
  GnosisPerson,
  GnosisPlace,
  GnosisSearchResult,
  GnosisStrongsEntry,
  GnosisTopic,
  GnosisTopicAspect,
  PaginatedResponse,
  PaginationOpts,
  VerseEntities,
} from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

let dbInitPromise: Promise<Database> | null = null;

async function getGnosisDb(): Promise<Database> {
  if (!dbInitPromise) {
    dbInitPromise = initGnosisDb();
  }
  return dbInitPromise;
}

async function initGnosisDb(): Promise<Database> {
  const dataDir = await appDataDir();
  const destPath = await join(dataDir, 'gnosis-lite.db');

  // Copy bundled resource if not present
  try {
    await invoke('install_bundled_module', {
      resourceName: 'gnosis-lite.db',
      destPath,
      force: true,
    });
    console.log('[Gnosis] Bundled DB installed at:', destPath);
  } catch (e) {
    console.warn('[Gnosis] Failed to install bundled gnosis-lite.db:', e);
  }

  // Use just the filename — Tauri SQL plugin resolves relative to app data dir
  const db = await Database.load('sqlite:gnosis-lite.db');

  try {
    const meta = await db.select<{ build_date: string; version: string }[]>('SELECT build_date, version FROM gnosis_meta LIMIT 1');
    if (meta.length > 0) {
      console.log(`[Gnosis] Loaded v${meta[0].version} (built ${meta[0].build_date}) from ${destPath}`);
    } else {
      console.log(`[Gnosis] Loaded (no version info) from ${destPath}`);
    }
  } catch {
    console.log(`[Gnosis] Loaded (no meta table) from ${destPath}`);
  }

  return db;
}

function limitOffset(opts?: PaginationOpts): { limit: number; offset: number } {
  return { limit: opts?.limit ?? 50, offset: opts?.offset ?? 0 };
}

export class GnosisLocalDb implements GnosisDataProvider {
  readonly mode = 'local' as const;

  isAvailable(): boolean {
    return true; // always available once init succeeds
  }

  private async db(): Promise<Database> {
    return getGnosisDb();
  }

  // --- Chapter ---

  async getBookChapterYears(book: string): Promise<Map<number, { year: number; yearDisplay: string }>> {
    const db = await this.db();
    const rows: any[] = await db.select(
      'SELECT osis_ref, year, year_display FROM chapter_timeline WHERE osis_ref LIKE ?',
      [`${book}.%`]
    );
    const result = new Map<number, { year: number; yearDisplay: string }>();
    for (const r of rows) {
      const ch = parseInt(r.osis_ref.split('.')[1], 10);
      if (!isNaN(ch)) result.set(ch, { year: r.year, yearDisplay: r.year_display });
    }
    return result;
  }

  async getChapterYear(book: string, chapter: number): Promise<{ year: number; yearDisplay: string } | null> {
    const db = await this.db();
    const osisRef = `${book}.${chapter}`;
    const rows: any[] = await db.select(
      'SELECT year, year_display FROM chapter_timeline WHERE osis_ref = ?',
      [osisRef]
    );
    if (!rows.length) return null;
    return { year: rows[0].year, yearDisplay: rows[0].year_display };
  }

  async getChapterEntities(book: string, chapter: number): Promise<ChapterEntities> {
    const db = await this.db();
    const prefix = `${book}.${chapter}.%`;

    const rows: any[] = await db.select(
      `SELECT 'person' as kind, p.slug FROM person p
         JOIN person_verse pv ON p.id = pv.person_id
         JOIN verse v ON pv.verse_id = v.id
       WHERE v.osis_ref LIKE ?1
       UNION
       SELECT 'place', pl.slug FROM place pl
         JOIN place_verse plv ON pl.id = plv.place_id
         JOIN verse v ON plv.verse_id = v.id
       WHERE v.osis_ref LIKE ?1
       UNION
       SELECT 'event', e.slug FROM event e
         JOIN event_verse ev ON e.id = ev.event_id
         JOIN verse v ON ev.verse_id = v.id
       WHERE v.osis_ref LIKE ?1
       UNION
       SELECT 'topic', t.slug FROM topic t
         JOIN topic_aspect ta ON t.id = ta.topic_id
         JOIN topic_aspect_verse tav ON ta.id = tav.aspect_id
         JOIN verse v ON tav.verse_id = v.id
       WHERE v.osis_ref LIKE ?1`,
      [prefix]
    );

    const people: string[] = [];
    const places: string[] = [];
    const events: string[] = [];
    const topics: string[] = [];
    const buckets: Record<string, string[]> = { person: people, place: places, event: events, topic: topics };

    for (const r of rows) {
      buckets[r.kind]?.push(r.slug);
    }

    return { book, chapter, people, places, events, topics };
  }

  // --- People ---

  async searchPeople(query: string, opts?: PaginationOpts & { gender?: string }): Promise<PaginatedResponse<GnosisPerson>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND p.name LIKE ?';
      params.push(`%${query}%`);
    }
    if (opts?.gender) {
      where += ' AND p.gender = ?';
      params.push(opts.gender);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM person p WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT p.* FROM person p WHERE ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r) => mapLocalPersonSummary(r));
    return { data, meta: { total, limit, offset } };
  }

  async getPerson(slug: string): Promise<GnosisPerson> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM person WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Person not found: ${slug}`);
    return this.buildPerson(db, rows[0]);
  }

  private async buildPerson(db: Database, r: any): Promise<GnosisPerson> {
    // Resolve family slugs
    const siblings: any[] = await db.select(
      `SELECT p.slug FROM person p JOIN person_sibling ps ON p.id = ps.sibling_id WHERE ps.person_id = ?
       UNION SELECT p.slug FROM person p JOIN person_sibling ps ON p.id = ps.person_id WHERE ps.sibling_id = ?`,
      [r.id, r.id]
    );
    const children: any[] = await db.select(
      'SELECT p.slug FROM person p JOIN person_child pc ON p.id = pc.child_id WHERE pc.parent_id = ?',
      [r.id]
    );
    const partners: any[] = await db.select(
      `SELECT p.slug FROM person p JOIN person_partner pp ON p.id = pp.partner_id WHERE pp.person_id = ?
       UNION SELECT p.slug FROM person p JOIN person_partner pp ON p.id = pp.person_id WHERE pp.partner_id = ?`,
      [r.id, r.id]
    );
    const verses: any[] = await db.select(
      'SELECT v.osis_ref FROM verse v JOIN person_verse pv ON v.id = pv.verse_id WHERE pv.person_id = ?',
      [r.id]
    );
    const groups: any[] = await db.select(
      'SELECT pg.slug FROM people_group pg JOIN person_group pgr ON pg.id = pgr.group_id WHERE pgr.person_id = ?',
      [r.id]
    );

    // Resolve father/mother/birth_place/death_place slugs
    const fatherSlug = r.father_id ? (await db.select('SELECT slug FROM person WHERE id = ?', [r.father_id]) as any[])[0]?.slug ?? null : null;
    const motherSlug = r.mother_id ? (await db.select('SELECT slug FROM person WHERE id = ?', [r.mother_id]) as any[])[0]?.slug ?? null : null;
    const birthPlaceSlug = r.birth_place_id ? (await db.select('SELECT slug FROM place WHERE id = ?', [r.birth_place_id]) as any[])[0]?.slug ?? null : null;
    const deathPlaceSlug = r.death_place_id ? (await db.select('SELECT slug FROM place WHERE id = ?', [r.death_place_id]) as any[])[0]?.slug ?? null : null;

    return {
      slug: r.slug,
      uuid: r.uuid,
      name: r.name,
      gender: r.gender ?? null,
      birthYear: r.birth_year ?? null,
      deathYear: r.death_year ?? null,
      birthYearDisplay: r.birth_year_display ?? null,
      deathYearDisplay: r.death_year_display ?? null,
      earliestYearMentioned: r.earliest_year_mentioned ?? null,
      latestYearMentioned: r.latest_year_mentioned ?? null,
      earliestYearMentionedDisplay: r.earliest_year_mentioned_display ?? null,
      latestYearMentionedDisplay: r.latest_year_mentioned_display ?? null,
      birthPlace: birthPlaceSlug,
      deathPlace: deathPlaceSlug,
      father: fatherSlug,
      mother: motherSlug,
      siblings: siblings.map((s) => s.slug),
      children: children.map((c) => c.slug),
      partners: partners.map((p) => p.slug),
      verseCount: r.verse_count ?? 0,
      verses: verses.map((v) => v.osis_ref),
      firstMention: r.first_mention ?? null,
      nameMeaning: r.name_meaning ?? null,
      peopleGroups: groups.map((g) => g.slug),
    };
  }

  // --- Places ---

  async searchPlaces(query: string, opts?: PaginationOpts & { hasCoordinates?: boolean; featureType?: string }): Promise<PaginatedResponse<GnosisPlace>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND (name LIKE ? OR kjv_name LIKE ? OR esv_name LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (opts?.hasCoordinates) {
      where += ' AND latitude IS NOT NULL';
    }
    if (opts?.featureType) {
      where += ' AND feature_type = ?';
      params.push(opts.featureType);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM place WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT * FROM place WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      data: rows.map(mapLocalPlace),
      meta: { total, limit, offset },
    };
  }

  async getPlace(slug: string): Promise<GnosisPlace> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM place WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Place not found: ${slug}`);
    return mapLocalPlace(rows[0]);
  }

  // --- Events ---

  async searchEvents(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisEvent>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND title LIKE ?';
      params.push(`%${query}%`);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM event WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT * FROM event WHERE ${where} ORDER BY sort_key LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r): GnosisEvent => ({
      slug: r.slug, uuid: r.uuid, title: r.title,
      startYear: r.start_year ?? null, endYear: r.end_year ?? null, startYearDisplay: r.start_year_display ?? null,
      duration: r.duration ?? null, sortKey: r.sort_key ?? null,
      participants: [], locations: [], verses: [],
      parentEvent: null, predecessor: null,
    }));
    return { data, meta: { total, limit, offset } };
  }

  async getEvent(slug: string): Promise<GnosisEvent> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM event WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Event not found: ${slug}`);
    return this.buildEvent(db, rows[0]);
  }

  private async buildEvent(db: Database, r: any): Promise<GnosisEvent> {
    const participants: any[] = await db.select(
      'SELECT p.slug FROM person p JOIN event_participant ep ON p.id = ep.person_id WHERE ep.event_id = ?',
      [r.id]
    );
    const verses: any[] = await db.select(
      'SELECT v.osis_ref FROM verse v JOIN event_verse ev ON v.id = ev.verse_id WHERE ev.event_id = ?',
      [r.id]
    );
    const parentSlug = r.parent_event_id
      ? ((await db.select('SELECT slug FROM event WHERE id = ?', [r.parent_event_id])) as any[])[0]?.slug ?? null
      : null;
    const predecessorSlug = r.predecessor_id
      ? ((await db.select('SELECT slug FROM event WHERE id = ?', [r.predecessor_id])) as any[])[0]?.slug ?? null
      : null;

    return {
      slug: r.slug,
      uuid: r.uuid,
      title: r.title,
      startYear: r.start_year ?? null,
      endYear: r.end_year ?? null,
      startYearDisplay: r.start_year_display ?? null,
      duration: r.duration ?? null,
      sortKey: r.sort_key ?? null,
      participants: participants.map((p) => p.slug),
      locations: [],
      verses: verses.map((v) => v.osis_ref),
      parentEvent: parentSlug,
      predecessor: predecessorSlug,
    };
  }

  // --- Topics ---

  async searchTopics(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisTopic>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND name LIKE ?';
      params.push(`%${query}%`);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM topic WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT * FROM topic WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r): GnosisTopic => ({
      slug: r.slug, uuid: r.uuid, name: r.name,
      aspects: [], seeAlso: [],
    }));
    return { data, meta: { total, limit, offset } };
  }

  async getTopic(slug: string): Promise<GnosisTopic> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM topic WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Topic not found: ${slug}`);
    return this.buildTopic(db, rows[0]);
  }

  private async buildTopic(db: Database, r: any): Promise<GnosisTopic> {
    const aspects: any[] = await db.select(
      'SELECT * FROM topic_aspect WHERE topic_id = ?',
      [r.id]
    );

    const builtAspects: GnosisTopicAspect[] = await Promise.all(
      aspects.map(async (a): Promise<GnosisTopicAspect> => {
        const verses: any[] = await db.select(
          'SELECT v.osis_ref FROM verse v JOIN topic_aspect_verse tav ON v.id = tav.verse_id WHERE tav.aspect_id = ?',
          [a.id]
        );
        return { label: a.label ?? null, source: a.source ?? null, verses: verses.map((v) => v.osis_ref) };
      })
    );

    const seeAlso: any[] = await db.select(
      'SELECT t.slug FROM topic t JOIN topic_see_also tsa ON t.id = tsa.related_topic_id WHERE tsa.topic_id = ?',
      [r.id]
    );

    return {
      slug: r.slug,
      uuid: r.uuid,
      name: r.name,
      aspects: builtAspects,
      seeAlso: seeAlso.map((s) => s.slug),
    };
  }

  // --- Groups ---

  async searchGroups(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisPeopleGroup>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND name LIKE ?';
      params.push(`%${query}%`);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM people_group WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT * FROM people_group WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r): GnosisPeopleGroup => ({
      slug: r.slug, uuid: r.uuid, name: r.name, members: [],
    }));

    return { data, meta: { total, limit, offset } };
  }

  async getGroup(slug: string): Promise<GnosisPeopleGroup> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM people_group WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Group not found: ${slug}`);
    const r = rows[0];
    const members: any[] = await db.select(
      'SELECT p.slug FROM person p JOIN person_group pg ON p.id = pg.person_id WHERE pg.group_id = ?',
      [r.id]
    );
    return { slug: r.slug, uuid: r.uuid, name: r.name, members: members.map((m) => m.slug) };
  }

  // --- Verse-level ---

  async getVerseEntities(osisRef: string): Promise<VerseEntities> {
    const db = await this.db();
    const vRows: any[] = await db.select('SELECT id FROM verse WHERE osis_ref = ?', [osisRef]);
    if (!vRows.length) return { osisRef, people: [], places: [], events: [], topics: [] };
    const vid = vRows[0].id;

    const rows: any[] = await db.select(
      `SELECT 'person' as kind, p.slug FROM person p JOIN person_verse pv ON p.id = pv.person_id WHERE pv.verse_id = ?
       UNION ALL
       SELECT 'place', pl.slug FROM place pl JOIN place_verse plv ON pl.id = plv.place_id WHERE plv.verse_id = ?
       UNION ALL
       SELECT 'event', e.slug FROM event e JOIN event_verse ev ON e.id = ev.event_id WHERE ev.verse_id = ?
       UNION ALL
       SELECT 'topic', t.slug FROM topic t JOIN topic_aspect ta ON t.id = ta.topic_id JOIN topic_aspect_verse tav ON ta.id = tav.aspect_id WHERE tav.verse_id = ? GROUP BY t.slug`,
      [vid, vid, vid, vid]
    );

    const people: string[] = [];
    const places: string[] = [];
    const events: string[] = [];
    const topics: string[] = [];
    const buckets: Record<string, string[]> = { person: people, place: places, event: events, topic: topics };
    for (const r of rows) buckets[r.kind]?.push(r.slug);

    return { osisRef, people, places, events, topics };
  }

  async getCrossReferences(osisRef: string): Promise<PaginatedResponse<GnosisCrossReference>> {
    const db = await this.db();
    const vRows: any[] = await db.select('SELECT id FROM verse WHERE osis_ref = ?', [osisRef]);
    if (!vRows.length) return { data: [], meta: { total: 0, limit: 0, offset: 0 } };
    const vid = vRows[0].id;

    const rows: any[] = await db.select(
      `SELECT vs.osis_ref as to_start, ve.osis_ref as to_end, cr.votes
       FROM cross_reference cr
       JOIN verse vs ON cr.to_verse_start_id = vs.id
       LEFT JOIN verse ve ON cr.to_verse_end_id = ve.id
       WHERE cr.from_verse_id = ?
       ORDER BY cr.votes DESC`,
      [vid]
    );

    const data: GnosisCrossReference[] = rows.map((r) => ({
      fromVerse: osisRef,
      toVerseStart: r.to_start,
      toVerseEnd: r.to_end ?? null,
      votes: r.votes ?? 0,
    }));

    return { data, meta: { total: data.length, limit: data.length, offset: 0 } };
  }

  // --- Language ---

  async getHebrewWords(osisRef: string): Promise<GnosisHebrewWord[]> {
    const db = await this.db();
    const vRows: any[] = await db.select('SELECT id FROM verse WHERE osis_ref = ?', [osisRef]);
    if (!vRows.length) return [];

    const rows: any[] = await db.select(
      'SELECT * FROM hebrew_word WHERE verse_id = ? ORDER BY position',
      [vRows[0].id]
    );

    return rows.map((r) => ({
      wordId: r.word_id,
      position: r.position,
      text: r.text,
      lemmaRaw: r.lemma_raw,
      strongsNumber: r.strongs_number ?? null,
      morph: r.morph,
    }));
  }

  async getGreekWords(osisRef: string): Promise<GnosisGreekWord[]> {
    const db = await this.db();
    const vRows: any[] = await db.select('SELECT id FROM verse WHERE osis_ref = ?', [osisRef]);
    if (!vRows.length) return [];

    const rows: any[] = await db.select(
      'SELECT * FROM greek_word WHERE verse_id = ? ORDER BY position',
      [vRows[0].id]
    );

    return rows.map((r) => ({
      wordId: r.word_id,
      position: r.position,
      text: r.text,
      lemma: r.lemma,
      strongsNumber: r.strongs_number ?? null,
      morph: r.morph,
    }));
  }

  async getLexiconEntry(lexicalId: string): Promise<GnosisLexiconEntry> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM lexicon_entry WHERE lexical_id = ?', [lexicalId]);
    if (!rows.length) throw new Error(`Lexicon entry not found: ${lexicalId}`);
    const r = rows[0];
    return {
      lexicalId: r.lexical_id,
      uuid: r.uuid,
      hebrew: r.hebrew,
      transliteration: r.transliteration ?? null,
      partOfSpeech: r.part_of_speech ?? null,
      gloss: r.gloss ?? null,
      strongsNumber: r.strongs_number ?? null,
      twotNumber: r.twot_number ?? null,
    };
  }

  async getGreekLexiconEntry(strongsNumber: string): Promise<GnosisGreekLexiconEntry> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM greek_lexicon_entry WHERE strongs_number = ?', [strongsNumber]);
    if (!rows.length) throw new Error(`Greek lexicon entry not found: ${strongsNumber}`);
    const r = rows[0];
    return {
      strongsNumber: r.strongs_number,
      uuid: r.uuid,
      greek: r.greek,
      transliteration: r.transliteration ?? null,
      partOfSpeech: r.part_of_speech ?? null,
      shortGloss: r.short_gloss ?? null,
      longGloss: r.long_gloss ?? null,
      gkNumber: r.gk_number ?? null,
    };
  }

  // --- Strong's & Dictionary ---

  async getStrongsEntry(number: string): Promise<GnosisStrongsEntry> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM strongs WHERE number = ?', [number]);
    if (!rows.length) throw new Error(`Strong's entry not found: ${number}`);
    const r = rows[0];
    return {
      number: r.number,
      uuid: r.uuid,
      language: r.language,
      lemma: r.lemma ?? null,
      transliteration: r.transliteration ?? null,
      pronunciation: r.pronunciation ?? null,
      definition: r.definition ?? null,
      kjvUsage: r.kjv_usage ?? null,
    };
  }

  async searchDictionary(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisDictionaryEntry>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);

    let where = '1=1';
    const params: any[] = [];
    if (query) {
      where += ' AND de.name LIKE ?';
      params.push(`%${query}%`);
    }

    const countRow: any[] = await db.select(`SELECT COUNT(*) as cnt FROM dictionary_entry de WHERE ${where}`, params);
    const total = countRow[0]?.cnt ?? 0;

    const rows: any[] = await db.select(
      `SELECT de.* FROM dictionary_entry de WHERE ${where} ORDER BY de.name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map((r): GnosisDictionaryEntry => ({
      slug: r.slug, uuid: r.uuid, name: r.name,
      definitions: [], scriptureRefs: [],
    }));
    return { data, meta: { total, limit, offset } };
  }

  async getDictionaryEntry(slug: string): Promise<GnosisDictionaryEntry> {
    const db = await this.db();
    const rows: any[] = await db.select('SELECT * FROM dictionary_entry WHERE slug = ?', [slug]);
    if (!rows.length) throw new Error(`Dictionary entry not found: ${slug}`);
    return this.buildDictionaryEntry(db, rows[0]);
  }

  private async buildDictionaryEntry(db: Database, r: any): Promise<GnosisDictionaryEntry> {
    const defs: any[] = await db.select(
      'SELECT source, text FROM dictionary_definition WHERE entry_id = ?',
      [r.id]
    );
    const verses: any[] = await db.select(
      'SELECT v.osis_ref FROM verse v JOIN dictionary_verse dv ON v.id = dv.verse_id WHERE dv.entry_id = ?',
      [r.id]
    );

    return {
      slug: r.slug,
      uuid: r.uuid,
      name: r.name,
      definitions: defs.map((d): GnosisDictionaryDefinition => ({ source: d.source, text: d.text })),
      scriptureRefs: verses.map((v) => v.osis_ref),
    };
  }

  // --- Search ---

  async search(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisSearchResult>> {
    const db = await this.db();
    const { limit, offset } = limitOffset(opts);
    const pattern = `%${query}%`;

    const rows: any[] = await db.select(
      `SELECT slug, name, 'person' as entity_type, uuid FROM person WHERE name LIKE ?
       UNION ALL
       SELECT slug, name, 'place', uuid FROM place WHERE name LIKE ?
       UNION ALL
       SELECT slug, title, 'event', uuid FROM event WHERE title LIKE ?
       UNION ALL
       SELECT slug, name, 'group', uuid FROM people_group WHERE name LIKE ?
       UNION ALL
       SELECT slug, name, 'dictionary', uuid FROM dictionary_entry WHERE name LIKE ?
       UNION ALL
       SELECT slug, name, 'topic', uuid FROM topic WHERE name LIKE ?
       LIMIT ? OFFSET ?`,
      [pattern, pattern, pattern, pattern, pattern, pattern, limit, offset]
    );

    const data: GnosisSearchResult[] = rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      entityType: r.entity_type,
      uuid: r.uuid,
    }));

    return { data, meta: { total: data.length, limit, offset } };
  }

  // --- Meta ---

  async getMeta(): Promise<GnosisMeta> {
    const db = await this.db();
    const metaRows: any[] = await db.select('SELECT key, value FROM gnosis_meta');
    const metaMap: Record<string, string> = {};
    for (const r of metaRows) metaMap[r.key] = r.value;

    const tables = ['person', 'place', 'event', 'people_group', 'strongs', 'dictionary_entry', 'topic', 'lexicon_entry', 'cross_reference', 'hebrew_word', 'greek_word', 'greek_lexicon_entry'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const row: any[] = await db.select(`SELECT COUNT(*) as cnt FROM ${table}`);
      counts[table] = row[0]?.cnt ?? 0;
    }

    return {
      version: metaMap.version ?? null,
      buildDate: metaMap.build_date ?? null,
      counts,
    };
  }
}

// --- Helpers ---

/** Lightweight person mapping for list views — no sub-queries */
function mapLocalPersonSummary(r: any): GnosisPerson {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    gender: r.gender ?? null,
    birthYear: r.birth_year ?? null,
    deathYear: r.death_year ?? null,
    birthYearDisplay: r.birth_year_display ?? null,
    deathYearDisplay: r.death_year_display ?? null,
    earliestYearMentioned: null,
    latestYearMentioned: null,
    earliestYearMentionedDisplay: null,
    latestYearMentionedDisplay: null,
    birthPlace: null,
    deathPlace: null,
    father: null,
    mother: null,
    siblings: [],
    children: [],
    partners: [],
    verseCount: r.verse_count ?? 0,
    verses: [],
    firstMention: r.first_mention ?? null,
    nameMeaning: r.name_meaning ?? null,
    peopleGroups: [],
  };
}

function mapLocalPlace(r: any): GnosisPlace {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    kjvName: r.kjv_name ?? null,
    esvName: r.esv_name ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    coordinateSource: r.coordinate_source ?? null,
    featureType: r.feature_type ?? null,
    featureSubType: r.feature_sub_type ?? null,
    modernName: r.modern_name ?? null,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
