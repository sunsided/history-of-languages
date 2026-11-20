// Ego network: one node in the middle, ancestors stacked above by hop distance, descendants below.
// Deterministic (no force simulation), so live data reloads don't make the picture jump.

import { FAMILY_OF, firstYear, reach, type EdgeFamily, type Graph } from './graph.ts';
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
	const layers = new Map<number, string[]>([[0, [centre]]]);
	for (const [dir, sign] of [['up', -1], ['down', 1]] as const) {
		for (const [id, d] of reach(g, centre, dir, families, hops)) {
			if (sign === 1 && layers.get(-d)?.includes(id)) continue; // never both; ancestor wins
			if (!visible(id)) continue;
			const l = sign * d;
			(layers.get(l) ?? layers.set(l, []).get(l)!).push(id);
		}
	}

	const linked = (a: string, b: string) =>
		(g.outgoing.get(a) ?? []).some((e) => e.to === b && families.has(FAMILY_OF[e.type])) ||
		(g.outgoing.get(b) ?? []).some((e) => e.to === a && families.has(FAMILY_OF[e.type]));

	// Order outward from the centre: each layer sorts by the mean slot of its neighbours in the layer
	// one step closer (barycentre, cuts crossings), then by year so time still reads left to right.
	const slot = new Map<string, number>([[centre, 0]]);
	const overflow = new Map<number, number>();
	const placed = new Map<number, string[]>([[0, [centre]]]);
	const year = (id: string) => firstYear(g.node.get(id)!);
	for (const sign of [-1, 1]) {
		for (let d = 1; layers.has(sign * d); d++) {
			const l = sign * d;
			const inner = placed.get(l - sign) ?? [];
			const bary = (id: string) => {
				const xs = inner.filter((o) => linked(id, o)).map((o) => slot.get(o)!);
				return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
			};
			// keep the closest-in-time neighbours when a layer overflows
			const all = layers.get(l)!.sort((a, b) => Math.abs(year(a) - year(centre)) - Math.abs(year(b) - year(centre)));
			const keep = all.slice(0, LAYER_MAX);
			if (all.length > keep.length) overflow.set(l, all.length - keep.length);
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
