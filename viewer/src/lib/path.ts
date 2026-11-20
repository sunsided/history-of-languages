// Shortest path between two nodes, for the path-finder toy.
//
// Stored relations are walked in both directions (up to a common ancestor and back down is a fine path).
// The cost model prefers paths that tell one story over paths that merely touch hubs:
//   - each edge costs by type (variants and successions are tighter than influences, a reaction is a
//     loose link), plus penalties for weak or poorly sourced edges;
//   - passing *through* a well-connected node costs extra, so routes stop detouring via Lisp or C;
//   - two consecutive edges that carry the same `aspects` concept get a discount (an idea travelling on);
//   - links not stored as edges are derived and cost more than any single edge: the same designer, the
//     same institution, or a rare shared concept tag.
// Dijkstra runs over (node, arriving link) states so that the continuity discount can see the last hop.

import { BACKWARD_LABEL, FORWARD_LABEL, type Graph } from './graph.ts';
import type { Edge, RelationType } from './types.ts';

export interface Via {
	kind: 'person' | 'institution' | 'concept';
	/** person name, institution name, or concept id */
	value: string;
}

export interface Hop {
	from: string;
	to: string;
	/** how `from` relates to `to`, e.g. "successor of", "influenced", "same designer as" */
	label: string;
	/** the stored relation, absent for derived hops */
	edge?: Edge;
	/** what a derived hop goes through */
	via?: Via;
}

const TYPE_COST: Record<RelationType, number> = {
	successor_of: 0.8,
	dialect_of: 0.8,
	fork_of: 0.8,
	superset_of: 0.8,
	subset_of: 0.8,
	extension_of: 0.8,
	influenced_by: 1,
	embeds: 1,
	targets: 1,
	implemented_in: 1,
	reacts_against: 1.4
};
const WEIGHT_COST = { strong: 0, moderate: 0.1, weak: 0.3 } as const;
const CONFIDENCE_COST = { high: 0, medium: 0.05, low: 0.4 } as const;
/** per log2(1 + degree) of an intermediate node: Lisp (degree ~56) ≈ 0.87, a leaf ≈ 0.15–0.25 */
const HUB_COST = 0.15;
/** discount when the arriving and leaving edges share an aspect */
const CONTINUITY = 0.25;
/** derived links: cost, and the largest group that still counts as a meaningful connection */
const DERIVED: Record<Via['kind'], { cost: number; max: number; label: string }> = {
	person: { cost: 1.6, max: 8, label: 'same designer as' },
	institution: { cost: 1.9, max: 6, label: 'same institution as' },
	concept: { cost: 2, max: 6, label: 'shares a concept with' }
};

interface Link {
	to: string;
	cost: number;
	label: string;
	aspects: string[];
	edge?: Edge;
	via?: Via;
}

interface Index {
	links: Map<string, Link[]>;
	hub: Map<string, number>;
}

const cache = new WeakMap<Graph, Index>();

function edgeCost(e: Edge): number {
	return TYPE_COST[e.type] + (WEIGHT_COST[e.weight ?? 'moderate'] ?? 0.1) + (CONFIDENCE_COST[e.confidence ?? 'medium'] ?? 0.05);
}

function index(g: Graph): Index {
	const hit = cache.get(g);
	if (hit) return hit;
	const links = new Map<string, Link[]>();
	const add = (from: string, l: Link) => (links.get(from) ?? links.set(from, []).get(from)!).push(l);

	// stored on the newer node: from -> older is "successor of" etc.; older -> newer reads the other way
	for (const e of g.data.edges) {
		const c = edgeCost(e);
		const aspects = e.aspects ?? [];
		add(e.from, { to: e.to, cost: c, label: BACKWARD_LABEL[e.type], aspects, edge: e });
		add(e.to, { to: e.from, cost: c, label: FORWARD_LABEL[e.type], aspects, edge: e });
	}

	const hub = new Map<string, number>();
	for (const id of g.node.keys()) {
		const deg = (g.outgoing.get(id)?.length ?? 0) + (g.incoming.get(id)?.length ?? 0);
		hub.set(id, HUB_COST * Math.log2(1 + deg));
	}

	// derived links: group nodes by a shared person, institution or rare concept
	const groups: Record<Via['kind'], Map<string, Set<string>>> = { person: new Map(), institution: new Map(), concept: new Map() };
	const put = (kind: Via['kind'], key: string | undefined, id: string) => {
		if (!key) return;
		(groups[kind].get(key) ?? groups[kind].set(key, new Set()).get(key)!).add(id);
	};
	for (const n of g.data.nodes) {
		for (const p of n.creators ?? []) put('person', p.name, n.id);
		for (const p of n.origin.places ?? []) put('institution', p.institution, n.id);
		for (const ids of Object.values(n.tags ?? {})) for (const c of ids) put('concept', c, n.id);
		for (const m of n.milestones ?? []) for (const c of m.introduces ?? []) put('concept', c, n.id);
	}
	for (const kind of Object.keys(groups) as Via['kind'][]) {
		const { cost, max, label } = DERIVED[kind];
		for (const [value, set] of groups[kind]) {
			if (set.size < 2 || set.size > max) continue;
			const ids = [...set];
			for (const a of ids)
				for (const b of ids) if (a !== b) add(a, { to: b, cost, label, aspects: kind === 'concept' ? [value] : [], via: { kind, value } });
		}
	}

	const idx = { links, hub };
	cache.set(g, idx);
	return idx;
}

/** Cheapest path from `a` to `b` over stored and derived links. Null when unreachable. */
export function shortestPath(g: Graph, a: string, b: string): Hop[] | null {
	if (!g.node.has(a) || !g.node.has(b)) return null;
	if (a === b) return [];
	const { links, hub } = index(g);

	// state = node plus the link used to arrive (null at the start)
	type State = { node: string; via: Link | null; dist: number; prev: State | null };
	const best = new Map<string, number>();
	const key = (node: string, l: Link | null) => (l ? `${node}\u0000${l.label}\u0000${l.to}\u0000${(l.edge && `${l.edge.from}>${l.edge.to}>${l.edge.type}`) ?? l.via?.value}` : node);
	const heap: State[] = [];
	const push = (s: State) => {
		heap.push(s);
		for (let i = heap.length - 1; i > 0; ) {
			const p = (i - 1) >> 1;
			if (heap[p].dist <= heap[i].dist) break;
			[heap[p], heap[i]] = [heap[i], heap[p]];
			i = p;
		}
	};
	const pop = (): State => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			for (let i = 0; ; ) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < heap.length && heap[l].dist < heap[m].dist) m = l;
				if (r < heap.length && heap[r].dist < heap[m].dist) m = r;
				if (m === i) break;
				[heap[m], heap[i]] = [heap[i], heap[m]];
				i = m;
			}
		}
		return top;
	};

	push({ node: a, via: null, dist: 0, prev: null });
	best.set(a, 0);
	let end: State | null = null;
	while (heap.length) {
		const s = pop();
		if (s.dist > (best.get(key(s.node, s.via)) ?? Infinity)) continue;
		if (s.node === b) {
			end = s;
			break;
		}
		const through = s.node === a ? 0 : (hub.get(s.node) ?? 0);
		for (const l of links.get(s.node) ?? []) {
			const shared = s.via?.aspects.some((c) => l.aspects.includes(c)) ? CONTINUITY : 0;
			const d = s.dist + Math.max(0.3, l.cost + through - shared);
			const k = key(l.to, l);
			if (d < (best.get(k) ?? Infinity)) {
				best.set(k, d);
				push({ node: l.to, via: l, dist: d, prev: s });
			}
		}
	}

	if (!end) return null;
	const hops: Hop[] = [];
	for (let s = end; s.prev && s.via; s = s.prev) {
		const l = s.via;
		hops.unshift({ from: s.prev.node, to: s.node, label: l.label, edge: l.edge, via: l.via });
	}
	return hops;
}
