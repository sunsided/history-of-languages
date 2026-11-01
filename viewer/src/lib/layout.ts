// Turns the cluster tree + expansion state into rows, and every node into an on-screen anchor.
// A node inside a collapsed cluster anchors on that cluster's row, so its edges still show (aggregated).

import { startYear, type ClusterInfo, type Graph } from './graph.ts';
import type { LangNode } from './types.ts';

export const DEFAULT_ROW_H = 24;

export type Row =
	| { type: 'cluster'; id: string; depth: number; y: number; expanded: boolean; info: ClusterInfo; members: string[] }
	| { type: 'node'; id: string; depth: number; y: number; node: LangNode };

export interface Anchor {
	/** row index */
	row: number;
	/** row centre */
	y: number;
	/** true when the node has its own row, false when folded into a cluster row */
	own: boolean;
}

export interface Layout {
	rows: Row[];
	height: number;
	anchor: Map<string, Anchor>;
}

export function layout(g: Graph, expanded: Set<string>, hiddenKinds: Set<string>, ROW_H = DEFAULT_ROW_H): Layout {
	const rows: Row[] = [];
	const anchor = new Map<string, Anchor>();
	const visibleNode = (id: string) => !hiddenKinds.has(g.node.get(id)!.kind);

	const push = (r: Row) => {
		rows.push(r);
		return rows.length - 1;
	};

	const visit = (id: string) => {
		const info = g.clusters.get(id)!;
		const members = info.allNodes.filter(visibleNode);
		if (members.length === 0 && hiddenKinds.size > 0) return;
		const open = expanded.has(id);
		const y = rows.length * ROW_H;
		const idx = push({ type: 'cluster', id, depth: info.depth, y, expanded: open, info, members });
		if (!open) {
			for (const nid of members) anchor.set(nid, { row: idx, y: y + ROW_H / 2, own: false });
			return;
		}
		// Interleave child clusters and own nodes by start year, so an expanded cluster reads as a cascade.
		const items: { start: number; kind: 'c' | 'n'; id: string }[] = [
			...info.children.map((c) => ({ start: g.clusters.get(c)!.start, kind: 'c' as const, id: c })),
			...info.nodes.filter(visibleNode).map((n) => ({ start: startYear(g.node.get(n)!), kind: 'n' as const, id: n }))
		].sort((a, b) => a.start - b.start || (a.kind === b.kind ? 0 : a.kind === 'n' ? -1 : 1));
		for (const it of items) {
			if (it.kind === 'c') visit(it.id);
			else {
				const ny = rows.length * ROW_H;
				const nidx = push({ type: 'node', id: it.id, depth: info.depth + 1, y: ny, node: g.node.get(it.id)! });
				anchor.set(it.id, { row: nidx, y: ny + ROW_H / 2, own: true });
			}
		}
	};
	for (const r of g.roots) visit(r);

	return { rows, height: rows.length * ROW_H, anchor };
}
