// Shortest path between two nodes over the relation graph, for the path-finder toy.
//
// Edges are walked in both directions (up to a common ancestor and back down is a fine path). Fewest hops
// wins; among equally short paths, strong and well-sourced links win (each hop costs 1 plus a penalty
// below 0.5, so the penalties never outweigh a hop).

import { BACKWARD_LABEL, FORWARD_LABEL, type Graph } from './graph.ts';
import type { Edge } from './types.ts';

export interface Hop {
	from: string;
	to: string;
	edge: Edge;
	/** how `from` relates to `to`, e.g. "successor of", "influenced" */
	label: string;
}

const WEIGHT_COST = { strong: 0, moderate: 0.1, weak: 0.2 } as const;
const CONFIDENCE_COST = { high: 0, medium: 0.05, low: 0.2 } as const;

function cost(e: Edge): number {
	return 1 + (WEIGHT_COST[e.weight ?? 'moderate'] ?? 0.1) + (CONFIDENCE_COST[e.confidence ?? 'medium'] ?? 0.05);
}

/** Dijkstra from `a` to `b` over all relations. Null when unreachable. */
export function shortestPath(g: Graph, a: string, b: string): Hop[] | null {
	if (!g.node.has(a) || !g.node.has(b)) return null;
	if (a === b) return [];

	const dist = new Map<string, number>([[a, 0]]);
	const prev = new Map<string, Hop>();
	const done = new Set<string>();
	const queue: string[] = [a];

	while (queue.length) {
		// a few hundred nodes: a linear scan for the minimum is plenty
		let best = 0;
		for (let i = 1; i < queue.length; i++) if (dist.get(queue[i])! < dist.get(queue[best])!) best = i;
		const cur = queue.splice(best, 1)[0];
		if (cur === b) break;
		if (done.has(cur)) continue;
		done.add(cur);

		const relax = (to: string, edge: Edge, label: string) => {
			if (done.has(to)) return;
			const d = dist.get(cur)! + cost(edge);
			if (d < (dist.get(to) ?? Infinity)) {
				dist.set(to, d);
				prev.set(to, { from: cur, to, edge, label });
				queue.push(to);
			}
		};
		// stored on the newer node: cur -> older is "successor of" etc.; older -> newer reads the other way
		for (const e of g.outgoing.get(cur) ?? []) relax(e.to, e, BACKWARD_LABEL[e.type]);
		for (const e of g.incoming.get(cur) ?? []) relax(e.from, e, FORWARD_LABEL[e.type]);
	}

	if (!prev.has(b)) return null;
	const hops: Hop[] = [];
	for (let at = b; at !== a; at = prev.get(at)!.from) hops.unshift(prev.get(at)!);
	return hops;
}
