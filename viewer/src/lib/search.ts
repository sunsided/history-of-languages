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

function entry(
	type: SearchType,
	id: string,
	label: string,
	detail: string,
	extra: { aliases?: string[]; year?: number; kind?: string; hasExample?: boolean } = {}
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
		acronym: labelWords.length > 1 ? labelWords.map((w) => w[0]).join('') : ''
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
				hasExample: !!n.example
			})
		);
	}
	for (const c of d.clusters) {
		entries.push(entry('cluster', c.id, c.name, `cluster · ${clusterPath(c.id)}${c.research_status ? ' · ' + c.research_status : ''}`));
	}
	for (const l of d.lineages) {
		entries.push(entry('lineage', l.id, l.title, `lineage · ${l.steps.length} steps`, { year: l.steps[0]?.year }));
	}
	for (const c of d.concepts) {
		entries.push(entry('concept', c.id, c.name, `concept · ${c.facet ?? ''}`, { year: c.first_seen?.year }));
	}
	for (const e of d.eras) {
		entries.push(entry('era', e.id, e.name, `era · ${e.start < 0 ? `${-e.start} BC` : e.start}–${e.end ?? 'now'}`, { year: e.start }));
	}
	return { entries, builtAt: new Date().toISOString() };
}

export interface SearchHit {
	entry: SearchEntry;
	score: number;
	/** [start, end) of the match in the label, for highlighting */
	range?: [number, number];
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
		const raw = scoreEntry(e, q, qCompact);
		if (raw <= 0) continue;
		const at = normalize(e.label).indexOf(q);
		hits.push({
			entry: e,
			score: raw - TYPE_RANK[e.type] * 4,
			range: at >= 0 && e.label.length === normalize(e.label).length ? [at, at + q.length] : undefined
		});
	}
	return hits
		.sort((a, b) => b.score - a.score || (a.entry.year ?? 9999) - (b.entry.year ?? 9999) || a.entry.label.localeCompare(b.entry.label))
		.slice(0, limit);
}
