// Global viewer state. Data is live: the dataset plugin pushes a fresh copy on every YAML save.

import initial from 'virtual:dataset';
import initialIndex from 'virtual:search-index';
import { MediaQuery, SvelteSet } from 'svelte/reactivity';
import { buildGraph, clusterPath, type EdgeFamily, type Graph } from './graph.ts';
import type { Dataset } from './types.ts';
import type { SearchEntry, SearchIndex } from './search.ts';

const STORAGE_KEY = 'hol-viewer:v2';
const RECENT_KEY = 'hol-viewer:recent';
const RECENT_MAX = 8;

/** Influence edges are dense; start with the structural ones and let the user opt in. */
const DEFAULT_FAMILIES: EdgeFamily[] = ['succession', 'variant'];

/** Top-level clusters start expanded unless clusters.yaml marks them `collapsed: true`. */
function defaultExpanded(g: Graph): Set<string> {
	return new Set(g.roots.filter((id) => !g.clusters.get(id)!.cluster.collapsed));
}

interface Persisted {
	/** expansion is stored as a diff against the data defaults, so `collapsed` edits still apply */
	opened: string[];
	closed: string[];
	families: EdgeFamily[];
	hiddenKinds: string[];
	zoom: number;
	depth: 'direct' | 'full';
}

function loadPersisted(): Partial<Persisted> {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function loadRecent(): string[] {
	try {
		const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
		return Array.isArray(r) ? r.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export type Selection = { type: 'node' | 'cluster'; id: string } | null;
export type Hover = { type: 'node'; id: string } | { type: 'edge'; from: string; to: string; idx: number } | null;

class Viewer {
	data = $state.raw<Dataset>(initial);
	graph = $derived(buildGraph(this.data));
	/** built by the dataset plugin, replaced on every data push */
	searchIndex = $state.raw<SearchIndex>(initialIndex);
	paletteOpen = $state(false);
	/** last palette destinations, "type:id", newest first */
	recent = $state<string[]>(loadRecent());
	/** bumps on every live data update, for a small "reloaded" flash */
	updates = $state(0);

	expanded: SvelteSet<string>;
	families: SvelteSet<EdgeFamily>;
	hiddenKinds: SvelteSet<string>;
	zoom = $state(1);
	/** zoom at which the axis exactly fills the viewport; set by the timeline from its measured width */
	minZoom = $state(0.25);
	/** never narrower than the viewport, so there is no dead strip on the right */
	effectiveZoom = $derived(Math.max(this.zoom, this.minZoom));
	depth = $state<'direct' | 'full'>('full');

	selected = $state<Selection>(null);
	hover = $state<Hover>(null);
	concept = $state<string | null>(null);
	lineage = $state<string | null>(null);
	/** nodes of the lineage step the user clicked, highlighted on top of the lineage */
	stepNodes = $state<string[]>([]);
	/** responsive breakpoints */
	narrow = new MediaQuery('max-width: 899px');
	coarse = new MediaQuery('pointer: coarse');
	/** narrow screens: filter bar is toggled */
	filtersOpen = $state(false);
	/** detail sidebar: folded by default, opens on selection or via the toolbar toggle */
	panelOpen = $state(false);
	/** year at the horizontal centre of the timeline viewport (drives the era nav highlight) */
	centerYear = $state(1950);
	/** era button last clicked; wins the nav highlight until the user scrolls by hand
	 * (at the edges several eras clamp to the same scroll position, so centre-year alone is ambiguous) */
	pinnedEra = $state<string | null>(null);
	/** ask the timeline to scroll to an era ('now' = right edge) */
	jumpTarget = $state<{ era: string; tick: number } | null>(null);

	/** set to ask the timeline to scroll a node into view */
	scrollTarget = $state<{ id: string; type: 'node' | 'cluster'; tick: number } | null>(null);

	constructor() {
		const p = loadPersisted();
		this.expanded = new SvelteSet(this.applyDiff(defaultExpanded(this.graph), p.opened ?? [], p.closed ?? []));
		this.families = new SvelteSet(p.families ?? DEFAULT_FAMILIES);
		this.hiddenKinds = new SvelteSet(p.hiddenKinds ?? []);
		this.zoom = p.zoom ?? 1;
		this.depth = p.depth ?? 'full';
	}

	persist() {
		const { opened, closed } = this.expansionDiff();
		const p: Persisted = {
			opened,
			closed,
			families: [...this.families],
			hiddenKinds: [...this.hiddenKinds],
			zoom: this.zoom,
			depth: this.depth
		};
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
		} catch {
			// storage unavailable: state just won't survive a reload
		}
	}

	private applyDiff(defaults: Set<string>, opened: string[], closed: string[]): string[] {
		const out = new Set([...defaults, ...opened]);
		for (const id of closed) out.delete(id);
		return [...out];
	}

	private expansionDiff() {
		const defaults = defaultExpanded(this.graph);
		return {
			opened: [...this.expanded].filter((id) => !defaults.has(id)),
			closed: [...defaults].filter((id) => !this.expanded.has(id))
		};
	}

	setData(d: Dataset) {
		// Re-apply the user's toggles on top of the new data's defaults.
		const { opened, closed } = this.expansionDiff();
		this.data = d;
		const next = this.applyDiff(defaultExpanded(this.graph), opened, closed);
		this.expanded.clear();
		for (const id of next) this.expanded.add(id);
		this.updates++;
		const g = this.graph;
		if (this.selected?.type === 'node' && !g.node.has(this.selected.id)) this.selected = null;
		if (this.selected?.type === 'cluster' && !g.clusters.has(this.selected.id)) this.selected = null;
		if (this.lineage && !d.lineages.some((l) => l.id === this.lineage)) this.lineage = null;
	}

	/** Expand every cluster on the way to a node and scroll to it. */
	reveal(id: string) {
		for (const c of clusterPath(this.graph, id)) this.expanded.add(c);
		this.scrollTarget = { id, type: 'node', tick: (this.scrollTarget?.tick ?? 0) + 1 };
	}

	/** Expand a cluster and its ancestors and scroll its row into view. */
	revealCluster(id: string) {
		let cur: string | undefined = id;
		while (cur && this.graph.clusters.has(cur)) {
			this.expanded.add(cur);
			const c: { parent?: string; id: string } = this.graph.clusters.get(cur)!.cluster;
			cur = c.parent ?? (cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/')) : undefined);
		}
		this.scrollTarget = { id, type: 'cluster', tick: (this.scrollTarget?.tick ?? 0) + 1 };
	}

	/** Navigate to a palette result. */
	go(e: SearchEntry) {
		switch (e.type) {
			case 'node':
				this.selectNode(e.id);
				break;
			case 'cluster':
				this.revealCluster(e.id);
				this.selectCluster(e.id);
				break;
			case 'lineage':
				this.setLineage(e.id);
				break;
			case 'concept':
				this.setConcept(e.id);
				break;
			case 'era':
				this.jump(e.id);
				break;
		}
		const key = `${e.type}:${e.id}`;
		this.recent = [key, ...this.recent.filter((k) => k !== key)].slice(0, RECENT_MAX);
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
		} catch {
			// not persisted; fine
		}
		this.paletteOpen = false;
	}

	setZoom(z: number) {
		this.zoom = Math.min(12, Math.max(this.minZoom, z));
	}

	jump(era: string) {
		this.pinnedEra = era;
		this.jumpTarget = { era, tick: (this.jumpTarget?.tick ?? 0) + 1 };
	}

	selectCluster(id: string) {
		this.selected = { type: 'cluster', id };
		this.panelOpen = true;
	}

	setConcept(id: string | null) {
		this.concept = id;
		if (id) this.panelOpen = true;
	}

	setLineage(id: string | null) {
		this.lineage = id;
		this.stepNodes = [];
		if (id) this.panelOpen = true;
	}

	clearFocus() {
		this.selected = null;
		this.concept = null;
		this.lineage = null;
		this.stepNodes = [];
	}

	/** click on a node: select it, or deselect when it is already selected */
	toggleNode(id: string, reveal = true) {
		if (this.selected?.type === 'node' && this.selected.id === id) this.deselect();
		else this.selectNode(id, reveal);
	}

	deselect() {
		this.selected = null;
	}

	selectNode(id: string, reveal = true) {
		this.selected = { type: 'node', id };
		this.panelOpen = true;
		if (reveal) this.reveal(id);
	}

	toggleCluster(id: string) {
		if (this.expanded.has(id)) this.expanded.delete(id);
		else this.expanded.add(id);
	}

	expandAll() {
		for (const id of this.graph.clusters.keys()) this.expanded.add(id);
	}

	collapseAll() {
		this.expanded.clear();
	}

	toggle<T>(set: SvelteSet<T>, v: T) {
		if (set.has(v)) set.delete(v);
		else set.add(v);
	}
}

export const viewer = new Viewer();

$effect.root(() => {
	$effect(() => viewer.persist());
});

// Escape peels off one layer: selection first, then concept/lineage highlights.
if (typeof window !== 'undefined') {
	window.addEventListener('keydown', (ev) => {
		// Ctrl/Cmd-K toggles the command palette (overrides the browser's search-bar shortcut).
		if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
			ev.preventDefault();
			viewer.paletteOpen = !viewer.paletteOpen;
			return;
		}
		if (viewer.paletteOpen) return; // the palette handles its own keys
		if (ev.key !== 'Escape' || (ev.target as Element | null)?.matches?.('input, select, textarea')) return;
		if (viewer.selected) viewer.deselect();
		else viewer.clearFocus();
	});
}

if (import.meta.hot) {
	import.meta.hot.on('dataset:update', (p: { data: Dataset; index: SearchIndex }) => {
		viewer.setData(p.data);
		viewer.searchIndex = p.index;
	});
}
