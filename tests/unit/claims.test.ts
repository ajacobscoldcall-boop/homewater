/**
 * Science integrity (Track 4): every caption and journal entry is tagged as
 * established, simplified or a game device in src/data/claims.json, and the
 * tags point at real sources: an applied answer in docs/ADVISOR_NOTES.md or
 * published research on the journal's Sources page.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JOURNAL } from '../../src/ui/journal';

type Tag = { tag: 'established' | 'simplified' | 'device'; refs?: string[]; why?: string };
const claims = JSON.parse(readFileSync('src/data/claims.json', 'utf8')) as { captions: Record<string, Tag>; journal: Record<string, Tag> };
const captions = (JSON.parse(readFileSync('src/data/captions.json', 'utf8')) as { captions: Record<string, string> }).captions;
const notes = readFileSync('docs/ADVISOR_NOTES.md', 'utf8');
const sourceIds = new Set(JOURNAL.sources.items.map((s) => s.id));
const journalIds = [...JOURNAL.entries.map((e) => e.id), ...JOURNAL.facts.items.map((_, i) => `fact.${i}`)];
const all = (): [string, Tag][] => [...Object.entries(claims.captions), ...Object.entries(claims.journal)];

/** The text of one `## heading` section of the advisor notes, or null. */
function section(heading: string): string | null {
  const start = notes.indexOf(`\n## ${heading}\n`);
  if (start < 0) return null;
  const next = notes.indexOf('\n## ', start + 4);
  return notes.slice(start, next < 0 ? undefined : next);
}

describe('claims', () => {
  it('tags every caption, and tags only captions that exist', () => {
    expect(Object.keys(captions).filter((id) => !(id in claims.captions))).toEqual([]);
    expect(Object.keys(claims.captions).filter((id) => !(id in captions))).toEqual([]);
  });

  it('tags every journal entry and fact, and only those', () => {
    expect(journalIds.filter((id) => !(id in claims.journal))).toEqual([]);
    expect(Object.keys(claims.journal).filter((id) => !journalIds.includes(id))).toEqual([]);
  });

  it('gives each tag what it needs: references for established lines, a reason otherwise', () => {
    const bad: string[] = [];
    for (const [id, t] of all()) {
      if (!['established', 'simplified', 'device'].includes(t.tag)) bad.push(`${id}: tag ${t.tag}`);
      if (t.tag === 'established' && !t.refs?.length) bad.push(`${id}: established without refs`);
      if (t.tag !== 'established' && !t.why) bad.push(`${id}: ${t.tag} without why`);
    }
    expect(bad).toEqual([]);
  });

  it('points only at applied notes sections and listed sources', () => {
    const bad: string[] = [];
    for (const [id, t] of all()) {
      for (const ref of t.refs ?? []) {
        if (ref.startsWith('src:')) {
          if (!sourceIds.has(ref.slice(4))) bad.push(`${id}: ${ref}`);
        } else if (ref.startsWith('notes:')) {
          const [heading, label] = ref.slice(6).split(' > ');
          const text = section(heading!);
          // Established claims rest on answers, never on the open-question lists.
          if (!text || heading!.startsWith('Open questions') || (label && !text.includes(`**${label}**`))) bad.push(`${id}: ${ref}`);
        } else bad.push(`${id}: ${ref}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lists only sources something cites', () => {
    const cited = new Set(all().flatMap(([, t]) => (t.refs ?? []).filter((r) => r.startsWith('src:')).map((r) => r.slice(4))));
    expect([...sourceIds].filter((s) => !cited.has(s))).toEqual([]);
  });

  it('puts a "How true is this?" note on every simplified or device journal entry', () => {
    const missing = JOURNAL.entries.filter((e) => claims.journal[e.id]!.tag !== 'established' && !e.howTrue?.trim()).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('says "in the game" wherever its tag says the line does', () => {
    const bad = Object.entries(claims.captions)
      .filter(([, t]) => t.why?.includes('said "in the game"'))
      .filter(([id]) => !/in the game/i.test(captions[id]!))
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it('never names or mentions the advisor in player-facing text', () => {
    const text = [...Object.values(captions), ...JOURNAL.entries.flatMap((e) => [e.title, e.text, e.howTrue ?? '']), ...JOURNAL.sources.items.map((s) => s.cite + s.about)].join('\n');
    expect(text).not.toMatch(/advis/i);
  });
});
