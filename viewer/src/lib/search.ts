// Search index for the command palette.
//
// buildSearchIndex() runs in the Vite plugin (Node), so the browser receives a ready index with
// normalized keys instead of deriving them on every load. querySearch() runs in the browser.

import type { Dataset } from './types.ts';

export type SearchType = 'node' | 'cluster' | 'lineage' | 'concept' | 'era';

export interface SearchEntry {
	type: SearchType;
	id: string;
	label: string;
	/** one-line context: kind, cluster path, facet, ... */
	detail: string;
	year?: number;
	kind?: string;
	hasExample?: boolean;
	/** normalized match keys; keys[0] is the label, then aliases, id and spelling variants */
	keys: string[];
	/** normalized word starts across label and aliases, for "lisp" -> "Common Lisp" */
	words: string[];
	/** initials of the label words, e.g. "pl/i" -> "pi", "Standard ML" -> "sml" */
	acronym: string;
	/** prose (creators, summary, notes, milestone and lineage text) for the low-ranked full-text tier, e.g. "OS/2" */
	text?: string;
	/** length of the creators' part at the start of `text`; a match there ranks above other prose */
	peopleLen?: number;
}

export interface SearchIndex {
	entries: SearchEntry[];
	builtAt: string;
}

const TYPE_RANK: Record<SearchType, number> = { node: 0, cluster: 1, lineage: 2, concept: 3, era: 4 };

export function normalize(s: string): string {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Spelling variants people type for names with symbols: C++ -> cpp, C# -> csharp, Common Lisp -> commonlisp. */
function variants(s: string): string[] {
	const n = normalize(s);
	const out = new Set([n]);
	out.add(n.replace(/\+\+/g, 'pp').replace(/#/g, 'sharp'));
	out.add(n.replace(/[^a-z0-9+#]/g, ''));
	out.add(n.replace(/[^a-z0-9]/g, ''));
	out.delete('');
	return [...out];
}

function wordsOf(s: string): string[] {
	return normalize(s)
		.split(/[^a-z0-9+#]+/)
		.filter(Boolean);
}

function prose(parts: (string | undefined)[] | undefined): string | undefined {
	const t = (parts ?? []).filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
	return t || undefined;
}

function entry(
	type: SearchType,
	id: string,
	label: string,
	detail: string,
	extra: {
		aliases?: string[];
		year?: number;
		kind?: string;
		hasExample?: boolean;
		people?: string[];
		text?: (string | undefined)[];
	} = {}
): SearchEntry {
	const names = [label, ...(extra.aliases ?? [])];
	const keys = new Set<string>();
	for (const n of names) for (const v of variants(n)) keys.add(v);
	for (const v of variants(id.split('/').pop()!.replace(/-/g, ' '))) keys.add(v);
	const words = new Set(names.flatMap(wordsOf));
	const labelWords = wordsOf(label);
	return {
		type,
		id,
		label,
		detail,
		year: extra.year,
		kind: extra.kind,
		hasExample: extra.hasExample,
		keys: [normalize(label), ...[...keys].filter((k) => k !== normalize(label))],
		words: [...words],
		acronym: labelWords.length > 1 ? labelWords.map((w) => w[0]).join('') : '',
		text: prose([...(extra.people ?? []), ...(extra.text ?? [])]),
		peopleLen: extra.people?.length ? prose(extra.people)!.length : undefined
	};
}

export function buildSearchIndex(d: Dataset): SearchIndex {
	const clusterName = new Map(d.clusters.map((c) => [c.id, c.name]));
	const clusterPath = (id: string) =>
		id
			.split('/')
			.map((_, i, parts) => clusterName.get(parts.slice(0, i + 1).join('/')) ?? parts[i])
			.join(' › ');

	const entries: SearchEntry[] = [];
	for (const n of d.nodes) {
		const year = n.origin.first_appeared.year;
		entries.push(
			entry('node', n.id, n.name, `${n.kind}${n.category ? ' · ' + n.category : ''} · ${clusterPath(n.cluster)}`, {
				aliases: n.aliases,
				year,
				kind: n.kind,
				hasExample: !!n.example,
				people: (n.creators ?? []).map((c) => [c.name, c.role, c.affiliation].filter(Boolean).join(', ')),
				text: [
					n.summary,
					n.notes,
					...(n.milestones ?? []).map((m) => m.summary)
				]
			})
		);
	}
	for (const c of d.clusters) {
		entries.push(
			entry('cluster', c.id, c.name, `cluster · ${clusterPath(c.id)}${c.research_status ? ' · ' + c.research_status : ''}`, {
				text: [c.summary]
			})
		);
	}
	for (const l of d.lineages) {
		entries.push(
			entry('lineage', l.id, l.title, `lineage · ${l.steps.length} steps`, {
				year: l.steps[0]?.year,
				text: [l.thesis, ...l.steps.flatMap((st) => [st.title, st.text, ...(st.systems ?? [])])]
			})
		);
	}
	for (const c of d.concepts) {
		entries.push(entry('concept', c.id, c.name, `concept · ${c.facet ?? ''}`, { year: c.first_seen?.year, text: [c.summary] }));
	}
	for (const e of d.eras) {
		entries.push(entry('era', e.id, e.name, `era · ${e.start < 0 ? `${-e.start} BC` : e.start}–${e.end ?? 'now'}`, { year: e.start, text: [e.summary] }));
	}
	return { entries, builtAt: new Date().toISOString() };
}

export interface SearchHit {
	entry: SearchEntry;
	score: number;
	/** [start, end) of the match in the label, for highlighting */
	range?: [number, number];
	/** full-text hit: the matched passage as [before, match, after] */
	snippet?: [string, string, string];
}

// Normalized prose, computed on first query (the index ships the original text for snippets).
const normText = new WeakMap<SearchEntry, string>();
function normalizedText(e: SearchEntry): string {
	let t = normText.get(e);
	if (t === undefined) normText.set(e, (t = e.text ? normalize(e.text) : ''));
	return t;
}

// The prose with punctuation and spaces removed, plus where each kept character sits in the normalized
// text, so "os2" finds "OS/2" and the snippet can still point at the original passage.
const compactText = new WeakMap<SearchEntry, { c: string; pos: number[] }>();
function compacted(e: SearchEntry): { c: string; pos: number[] } {
	let v = compactText.get(e);
	if (!v) {
		const t = normalizedText(e);
		v = { c: '', pos: [] };
		for (let i = 0; i < t.length; i++) {
			if (/[a-z0-9]/.test(t[i])) {
				v.c += t[i];
				v.pos.push(i);
			}
		}
		compactText.set(e, v);
	}
	return v;
}

const wordStart = (t: string, i: number) => i === 0 || !/[a-z0-9]/.test(t[i - 1]);

/**
 * Prose match: a creator's name 40; elsewhere whole word or word start 30, ignoring punctuation 26
 * ("os2" for "OS/2"), mid-word 18 (longer queries only). Returns where the match sits in the normalized text.
 */
function textMatch(e: SearchEntry, q: string, qCompact: string): { score: number; at: number; len: number } | null {
	if (q.length < 3 || !e.text) return null;
	const t = normalizedText(e);
	let at = t.indexOf(q);
	let mid = -1;
	while (at >= 0) {
		if (wordStart(t, at)) return { score: at < (e.peopleLen ?? 0) ? 40 : 30, at, len: q.length };
		if (mid < 0) mid = at;
		at = t.indexOf(q, at + 1);
	}
	if (qCompact.length >= 3) {
		const { c, pos } = compacted(e);
		for (let i = c.indexOf(qCompact); i >= 0; i = c.indexOf(qCompact, i + 1)) {
			if (wordStart(t, pos[i])) return { score: 26, at: pos[i], len: pos[i + qCompact.length - 1] + 1 - pos[i] };
		}
	}
	return mid >= 0 && q.length >= 4 ? { score: 18, at: mid, len: q.length } : null;
}

function snippetAt(e: SearchEntry, at: number, len: number): [string, string, string] {
	// normalize() keeps lengths for plain text; fall back to the normalized form if it changed them
	const src = normalize(e.text!).length === e.text!.length ? e.text! : normalizedText(e);
	const from = Math.max(0, at - 40);
	const to = Math.min(src.length, at + len + 60);
	return [(from > 0 ? '…' : '') + src.slice(from, at), src.slice(at, at + len), src.slice(at + len, to) + (to < src.length ? '…' : '')];
}

/** In-order character match ("algl" -> "algol"); 0 unless the matched letters sit close together. */
function subsequence(q: string, s: string): number {
	let i = 0;
	let first = -1;
	let last = -1;
	for (let j = 0; j < s.length && i < q.length; j++) {
		if (s[j] === q[i]) {
			if (first < 0) first = j;
			last = j;
			i++;
		}
	}
	if (i < q.length) return 0;
	const slack = last - first + 1 - q.length; // letters skipped inside the match
	return slack <= Math.max(1, q.length / 2) ? 20 - slack * 3 : 0;
}

function scoreEntry(e: SearchEntry, q: string, qCompact: string): number {
	let best = 0;
	e.keys.forEach((k, i) => {
		const isLabel = i === 0;
		if (k === q || k === qCompact) best = Math.max(best, isLabel ? 100 : 92);
		else if (k.startsWith(q)) best = Math.max(best, isLabel ? 80 : 70);
		else if (qCompact.length > 1 && k.startsWith(qCompact)) best = Math.max(best, 66);
		else if (k.includes(q)) best = Math.max(best, isLabel ? 45 : 38);
	});
	if (best < 60 && e.words.some((w) => w.startsWith(q))) best = Math.max(best, 60);
	if (best < 55 && e.acronym && e.acronym === qCompact) best = 55;
	if (best === 0 && q.length >= 2) best = subsequence(qCompact, e.keys[0].replace(/[^a-z0-9+#]/g, ''));
	return best;
}

export function querySearch(index: SearchIndex, query: string, limit = 40): SearchHit[] {
	const q = normalize(query);
	if (!q) return [];
	const qCompact = q.replace(/[^a-z0-9+#]/g, '');
	const hits: SearchHit[] = [];
	for (const e of index.entries) {
		let raw = scoreEntry(e, q, qCompact);
		let snippet: SearchHit['snippet'];
		if (raw < 40) {
			const m = textMatch(e, q, qCompact.replace(/[+#]/g, ''));
			if (m && m.score > raw) {
				raw = m.score;
				snippet = snippetAt(e, m.at, m.len);
			}
		}
		if (raw <= 0) continue;
		const at = normalize(e.label).indexOf(q);
		hits.push({
			entry: e,
			score: raw - TYPE_RANK[e.type] * 4,
			range: at >= 0 && e.label.length === normalize(e.label).length ? [at, at + q.length] : undefined,
			snippet
		});
	}
	return hits
		.sort((a, b) => b.score - a.score || (a.entry.year ?? 9999) - (b.entry.year ?? 9999) || a.entry.label.localeCompare(b.entry.label))
		.slice(0, limit);
}
