// Derived lookups over a Dataset: indexes, cluster tree, transitive ancestry, edge styling.

import type { Cluster, Concept, Dataset, Edge, LangNode, MediaItem, RelationType, Source } from './types.ts';
import { NOW } from './scale.ts';

export type EdgeFamily = 'influence' | 'succession' | 'variant' | 'targets' | 'implementation';

export const FAMILY_OF: Record<RelationType, EdgeFamily> = {
	influenced_by: 'influence',
	successor_of: 'succession',
	dialect_of: 'variant',
	superset_of: 'variant',
	subset_of: 'variant',
	fork_of: 'variant',
	targets: 'targets',
	implemented_in: 'implementation'
};

export const FAMILIES: { id: EdgeFamily; label: string; hint: string }[] = [
	{ id: 'succession', label: 'Succession', hint: 'successor_of: intended replacement in the same line' },
	{ id: 'influence', label: 'Influence', hint: 'influenced_by: design influence' },
	{ id: 'variant', label: 'Variant', hint: 'dialect_of / superset_of / subset_of / fork_of' },
	{ id: 'targets', label: 'Targets', hint: 'targets: assembly or language -> machine' },
	{ id: 'implementation', label: 'Implemented in', hint: 'implemented_in: bootstrapping history' }
];

/** Forward-in-time wording for an edge stored on the newer node (older --label--> newer). */
export const FORWARD_LABEL: Record<RelationType, string> = {
	influenced_by: 'influenced',
	successor_of: 'superseded by',
	dialect_of: 'has dialect',
	superset_of: 'has superset',
	subset_of: 'has subset',
	fork_of: 'forked as',
	targets: 'targeted by',
	implemented_in: 'used to implement'
};

export const BACKWARD_LABEL: Record<RelationType, string> = {
	influenced_by: 'influenced by',
	successor_of: 'successor of',
	dialect_of: 'dialect of',
	superset_of: 'superset of',
	subset_of: 'subset of',
	fork_of: 'fork of',
	targets: 'targets',
	implemented_in: 'implemented in'
};

export interface ClusterInfo {
	cluster: Cluster;
	depth: number;
	children: string[];
	nodes: string[];
	/** all nodes in this cluster and its descendants */
	allNodes: string[];
	start: number;
	end: number;
}

export interface Graph {
	data: Dataset;
	node: Map<string, LangNode>;
	concept: Map<string, Concept>;
	source: Map<string, Source>;
	clusters: Map<string, ClusterInfo>;
	roots: string[];
	/** edges stored on a node (pointing back in time) */
	outgoing: Map<string, Edge[]>;
	/** edges pointing at a node from newer ones */
	incoming: Map<string, Edge[]>;
	/** machine / document / artifact images per node */
	nodeMedia: Map<string, MediaItem[]>;
	/** portraits by person name, as written in nodes' creators */
	personMedia: Map<string, MediaItem>;
}

export const startYear = (n: LangNode) => n.origin.began?.year ?? n.origin.first_appeared.year;
export const firstYear = (n: LangNode) => n.origin.first_appeared.year;

/** Where the node's life line ends: now for living languages, else its last milestone. */
export function endYear(n: LangNode): number {
	if (n.status === 'active' || n.status === 'maintained') return NOW;
	const last = Math.max(firstYear(n), ...(n.milestones ?? []).map((m) => m.year));
	return last;
}

/**
 * Where an edge leaves the older node's timeline: the `from_version` milestone if named, else the
 * branch year (the relation's `year`, then the newer node's began / first_appeared), clamped to the
 * older node's span.
 */
export function branchYear(e: Edge, older: LangNode, newer: LangNode): number {
	const m = e.from_version ? older.milestones?.find((m) => String(m.version) === e.from_version) : undefined;
	if (m) return m.year;
	const y = e.year ?? (newer.origin.began ?? newer.origin.first_appeared).year;
	return Math.min(Math.max(y, firstYear(older)), endYear(older));
}

export function buildGraph(data: Dataset): Graph {
	const node = new Map(data.nodes.map((n) => [n.id, n]));
	const concept = new Map(data.concepts.map((c) => [c.id, c]));
	const source = new Map(data.sources.map((s) => [s.id, s]));

	const outgoing = new Map<string, Edge[]>();
	const incoming = new Map<string, Edge[]>();
	for (const e of data.edges) {
		(outgoing.get(e.from) ?? outgoing.set(e.from, []).get(e.from)!).push(e);
		(incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e);
	}

	const clusters = new Map<string, ClusterInfo>();
	for (const c of data.clusters) {
		clusters.set(c.id, { cluster: c, depth: 0, children: [], nodes: [], allNodes: [], start: Infinity, end: -Infinity });
	}
	const parentOf = (c: Cluster) => c.parent ?? (c.id.includes('/') ? c.id.slice(0, c.id.lastIndexOf('/')) : undefined);
	const roots: string[] = [];
	for (const info of clusters.values()) {
		const p = parentOf(info.cluster);
		if (p && clusters.has(p)) clusters.get(p)!.children.push(info.cluster.id);
		else roots.push(info.cluster.id);
	}
	for (const n of data.nodes) clusters.get(n.cluster)?.nodes.push(n.id);

	const visit = (id: string, depth: number): ClusterInfo => {
		const info = clusters.get(id)!;
		info.depth = depth;
		info.allNodes = [...info.nodes];
		for (const nid of info.nodes) {
			const n = node.get(nid)!;
			info.start = Math.min(info.start, startYear(n));
			info.end = Math.max(info.end, endYear(n));
		}
		for (const b of info.cluster.backlog ?? []) {
			if (typeof b.year === 'number') info.start = Math.min(info.start, b.year);
		}
		for (const ch of info.children) {
			const ci = visit(ch, depth + 1);
			info.allNodes.push(...ci.allNodes);
			info.start = Math.min(info.start, ci.start);
			info.end = Math.max(info.end, ci.end);
		}
		return info;
	};
	for (const r of roots) visit(r, 0);

	const byStart = (a: string, b: string) => clusters.get(a)!.start - clusters.get(b)!.start;
	roots.sort(byStart);
	for (const info of clusters.values()) {
		info.children.sort(byStart);
		info.nodes.sort((a, b) => startYear(node.get(a)!) - startYear(node.get(b)!));
	}

	const nodeMedia = new Map<string, MediaItem[]>();
	const personMedia = new Map<string, MediaItem>();
	for (const m of data.media ?? []) {
		if (m.kind === 'person') {
			if (m.person) personMedia.set(m.person, m);
			continue;
		}
		for (const n of m.nodes ?? []) (nodeMedia.get(n) ?? nodeMedia.set(n, []).get(n)!).push(m);
	}

	return { data, node, concept, source, clusters, roots, outgoing, incoming, nodeMedia, personMedia };
}

/** Cluster ids from the root down to (and including) the node's own cluster. */
export function clusterPath(g: Graph, nodeId: string): string[] {
	const n = g.node.get(nodeId);
	if (!n) return [];
	const out: string[] = [];
	let id: string | undefined = n.cluster;
	while (id && g.clusters.has(id)) {
		out.unshift(id);
		const c: Cluster = g.clusters.get(id)!.cluster;
		id = c.parent ?? (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : undefined);
	}
	return out;
}

/** Transitive closure along enabled edge families. Direction 'up' = older ancestors, 'down' = newer descendants. */
export function reach(g: Graph, start: string, dir: 'up' | 'down', families: Set<EdgeFamily>, maxDepth = Infinity) {
	const seen = new Map<string, number>([[start, 0]]);
	const queue = [start];
	while (queue.length) {
		const id = queue.shift()!;
		const d = seen.get(id)!;
		if (d >= maxDepth) continue;
		const edges = dir === 'up' ? g.outgoing.get(id) : g.incoming.get(id);
		for (const e of edges ?? []) {
			if (!families.has(FAMILY_OF[e.type])) continue;
			const next = dir === 'up' ? e.to : e.from;
			if (!seen.has(next)) {
				seen.set(next, d + 1);
				queue.push(next);
			}
		}
	}
	seen.delete(start);
	return seen;
}

/** Year a node acquired a concept: the milestone that introduced it, else its first appearance if tagged. */
export function conceptArrival(n: LangNode, conceptId: string): { year: number; version?: string } | undefined {
	for (const m of n.milestones ?? []) {
		if (m.introduces?.includes(conceptId)) return { year: m.year, version: m.version };
	}
	for (const vals of Object.values(n.tags ?? {})) {
		if (vals.includes(conceptId)) return { year: firstYear(n) };
	}
	for (const e of n.relations ?? []) {
		if (e.aspects?.includes(conceptId)) return { year: e.year ?? firstYear(n) };
	}
	return undefined;
}

/** Concept ids that are `conceptId` or narrower than it (goroutines counts for green-threads). */
export function narrowerConcepts(g: Graph, conceptId: string): Set<string> {
	const out = new Set([conceptId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const c of g.data.concepts) {
			if (!out.has(c.id) && c.broader?.some((b) => out.has(b))) {
				out.add(c.id);
				grew = true;
			}
		}
	}
	return out;
}

/** Same category, first appearance within ±window years, and no direct edge: a proxy for competitors. */
export function contemporaries(g: Graph, id: string, window = 5): LangNode[] {
	const n = g.node.get(id);
	if (!n || !n.category) return [];
	const linked = new Set([...(g.outgoing.get(id) ?? []).map((e) => e.to), ...(g.incoming.get(id) ?? []).map((e) => e.from)]);
	const y = firstYear(n);
	return g.data.nodes
		.filter((m) => m.id !== id && m.kind === n.kind && m.category === n.category && !linked.has(m.id))
		.filter((m) => Math.abs(firstYear(m) - y) <= window)
		.sort((a, b) => firstYear(a) - firstYear(b));
}

/** Strip Wikimedia Commons template residue from captions and dates ("date QS:P,+1843-…", "w:en:"). */
export function cleanCommons(text: string | undefined): string {
	if (!text) return '';
	return text
		.replace(/date QS:P\S*/g, '')
		.replace(/\bw:[a-z]{2,3}:/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * URL of a media file: served by the dev middleware, emitted into the static build (see vite/dataset.ts).
 * Relative to the page on purpose: the app is a single page that never changes its URL, and a relative
 * path also resolves inside web archives that serve the site under their own prefix.
 */
export const mediaUrl = (m: MediaItem) => __MEDIA_PREFIX__ + m.file;
