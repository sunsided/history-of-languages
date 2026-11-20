// Ego network: one node in the middle, ancestors stacked above by hop distance, descendants below.
// Deterministic (no force simulation), so live data reloads don't make the picture jump.

import { FAMILY_OF, firstYear, type EdgeFamily, type Graph } from './graph.ts';
import type { Edge } from './types.ts';

export const LAYER_H = 96;
export const COL_W = 132;
/** widest layer drawn; the rest are counted, not placed (C and Lisp have hundreds of descendants) */
export const LAYER_MAX = 14;

export interface EgoNode {
	id: string;
	/** negative = ancestor hops, 0 = centre, positive = descendant hops */
	layer: number;
	x: number;
	y: number;
}

export interface EgoLayout {
	nodes: EgoNode[];
	pos: Map<string, EgoNode>;
	/** edges among placed nodes, in enabled families */
	edges: Edge[];
	/** per layer: nodes reached but not placed */
	overflow: Map<number, number>;
	minX: number;
	maxX: number;
	minLayer: number;
	maxLayer: number;
}

export function egoLayout(g: Graph, centre: string, families: Set<EdgeFamily>, hops: number, hiddenKinds: Set<string>): EgoLayout {
	const visible = (id: string) => !hiddenKinds.has(g.node.get(id)!.kind);
	const on = (e: Edge) => families.has(FAMILY_OF[e.type]);
	const year = (id: string) => firstYear(g.node.get(id)!);
	// Breadth-first per direction, expanding only from placed nodes, so every drawn node has a drawn
	// path to the centre. One `seen` across both directions: the data has cycles (C <-> WebAssembly).
	const seen = new Set([centre]);
	const overflow = new Map<number, number>();
	const layers = new Map<number, string[]>([[0, [centre]]]);
	for (const sign of [-1, 1]) {
		let frontier = [centre];
		for (let d = 1; d <= hops && frontier.length; d++) {
			const next = new Set<string>();
			for (const id of frontier) {
				const nb = sign < 0 ? (g.outgoing.get(id) ?? []).filter(on).map((e) => e.to) : (g.incoming.get(id) ?? []).filter(on).map((e) => e.from);
				for (const n of nb) if (!seen.has(n) && visible(n)) next.add(n);
			}
			// keep the closest-in-time neighbours when a layer overflows
			const all = [...next].sort((a, b) => Math.abs(year(a) - year(centre)) - Math.abs(year(b) - year(centre)) || a.localeCompare(b));
			frontier = all.slice(0, LAYER_MAX);
			if (all.length > frontier.length) overflow.set(sign * d, all.length - frontier.length);
			for (const n of frontier) seen.add(n);
			if (frontier.length) layers.set(sign * d, frontier);
		}
	}

	const linked = (a: string, b: string) =>
		(g.outgoing.get(a) ?? []).some((e) => e.to === b && families.has(FAMILY_OF[e.type])) ||
		(g.outgoing.get(b) ?? []).some((e) => e.to === a && families.has(FAMILY_OF[e.type]));

	// Order outward from the centre: each layer sorts by the mean slot of its neighbours in the layer
	// one step closer (barycentre, cuts crossings), then by year so time still reads left to right.
	const slot = new Map<string, number>([[centre, 0]]);
	const placed = new Map<number, string[]>([[0, [centre]]]);
	for (const sign of [-1, 1]) {
		for (let d = 1; layers.has(sign * d); d++) {
			const l = sign * d;
			const inner = placed.get(l - sign) ?? [];
			const bary = (id: string) => {
				const xs = inner.filter((o) => linked(id, o)).map((o) => slot.get(o)!);
				return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
			};
			const keep = [...layers.get(l)!];
			const b = new Map(keep.map((id) => [id, bary(id)]));
			keep.sort((x, y) => b.get(x)! - b.get(y)! || year(x) - year(y) || x.localeCompare(y));
			keep.forEach((id, i) => slot.set(id, i - (keep.length - 1) / 2));
			placed.set(l, keep);
		}
	}

	const nodes: EgoNode[] = [];
	for (const [layer, ids] of placed) for (const id of ids) nodes.push({ id, layer, x: slot.get(id)! * COL_W, y: layer * LAYER_H });
	const pos = new Map(nodes.map((n) => [n.id, n]));
	const edges = nodes.flatMap((n) => (g.outgoing.get(n.id) ?? []).filter((e) => pos.has(e.to) && families.has(FAMILY_OF[e.type])));
	const layerKeys = [...placed.keys()];
	return {
		nodes,
		pos,
		edges,
		overflow,
		minX: Math.min(...nodes.map((n) => n.x)),
		maxX: Math.max(...nodes.map((n) => n.x)),
		minLayer: Math.min(...layerKeys),
		maxLayer: Math.max(...layerKeys)
	};
}
