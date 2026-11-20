<script lang="ts">
	// Ego network: the selected node in the middle, ancestors above, descendants below, by hop distance.
	import { viewer } from '#lib/viewer.svelte.ts';
	import { FAMILIES, FAMILY_OF, FORWARD_LABEL, firstYear } from '#lib/graph.ts';
	import { COL_W, LAYER_H, egoLayout } from '#lib/ego.ts';
	import type { Edge } from '#lib/types.ts';
	import Button from '../atoms/Button.svelte';
	import Legend from './Legend.svelte';

	const PAD = 72;
	const R = 6;

	const g = $derived(viewer.graph);
	const centre = $derived(viewer.selected?.type === 'node' ? viewer.selected.id : null);
	const lay = $derived(centre ? egoLayout(g, centre, viewer.families, viewer.hops, viewer.hiddenKinds) : null);

	// svg coordinates: shift so the leftmost node and the top layer sit PAD inside the canvas
	const ox = $derived(lay ? PAD + COL_W / 2 - lay.minX : 0);
	const oy = $derived(lay ? PAD - lay.minLayer * LAYER_H : 0);
	const width = $derived(lay ? lay.maxX - lay.minX + COL_W + 2 * PAD : 0);
	const height = $derived(lay ? (lay.maxLayer - lay.minLayer) * LAYER_H + 2 * PAD : 0);

	let hover = $state<string | null>(null);
	let scroller = $state<HTMLDivElement>();

	// keep the centre node in the middle of the viewport whenever it changes
	$effect(() => {
		if (!scroller || !lay || !centre) return;
		scroller.scrollLeft = ox - scroller.clientWidth / 2;
		scroller.scrollTop = oy - scroller.clientHeight / 2;
	});

	/** drawn from the older node (edge.to) to the newer one (edge.from), arrow at the newer end */
	function edgePath(e: Edge): string {
		const a = lay!.pos.get(e.to)!;
		const b = lay!.pos.get(e.from)!;
		const x1 = a.x + ox, y1 = a.y + oy, x2 = b.x + ox;
		if (a.layer === b.layer) {
			const bow = y1 - LAYER_H * 0.35;
			return `M${x1},${y1 - R} C${x1},${bow} ${x2},${bow} ${x2},${y1 - R - 3}`;
		}
		const dir = Math.sign(b.y - a.y);
		// leave from under the name and year when going down, so lines don't strike through labels
		const ya = y1 + (dir > 0 ? R + 34 : -R), yb = b.y + oy - dir * (R + 3);
		const my = (ya + yb) / 2;
		return `M${x1},${ya} C${x1},${my} ${x2},${my} ${x2},${yb}`;
	}

	const name = (id: string) => g.node.get(id)?.name ?? id;
	const select = (id: string) => (id === centre ? viewer.deselect() : viewer.selectNode(id, false));
	const onTimeline = () => {
		viewer.view = 'timeline';
		if (centre) viewer.reveal(centre);
	};
</script>

<div class="network">
	<div class="bar">
		{#if lay}
			<span class="counts">{lay.nodes.length - 1} related · {lay.edges.length} edges</span>
		{/if}
		<div class="hops" role="group" aria-label="Hops from the selected language">
			<span class="lbl">Hops</span>
			{#each [1, 2, 3] as h (h)}
				<Button variant="pill" aria-pressed={viewer.hops === h} onclick={() => (viewer.hops = h)}>{h}</Button>
			{/each}
		</div>
		{#if centre}<Button onclick={onTimeline} title="Switch to the timeline and scroll to this language">Show on timeline</Button>{/if}
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="scroller" id="timeline" role="region" aria-label="Network around the selected language" tabindex="0" bind:this={scroller}>
		{#if !lay}
			<p class="empty">Pick a language (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd>) to see its ancestors and descendants.</p>
		{:else}
			<svg {width} {height} role="img" aria-label="Ancestors of {name(centre!)} above, descendants below">
				<defs>
					{#each FAMILIES as f (f.id)}
						<marker id="net-arrow-{f.id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M0,0 L8,4 L0,8 z" class="arrowhead fam-{f.id}" />
						</marker>
					{/each}
				</defs>

				{#each [...lay.overflow] as [layer, n] (layer)}
					<text x={lay.maxX + ox + COL_W / 2} y={layer * LAYER_H + oy + 4} class="more">+{n} more</text>
				{/each}

				<g class="edges" class:filtering={hover !== null}>
					{#each lay.edges as e (`${e.from}>${e.to}>${e.type}`)}
						{@const f = FAMILY_OF[e.type]}
						<path
							d={edgePath(e)}
							class="edge fam-{f} conf-{e.confidence ?? 'medium'}"
							class:hot={hover === e.from || hover === e.to}
							marker-end="url(#net-arrow-{f})"
						>
							<title>{name(e.to)} {FORWARD_LABEL[e.type]} {name(e.from)}</title>
						</path>
					{/each}
				</g>

				{#each lay.nodes as n (n.id)}
					{@const node = g.node.get(n.id)!}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g
						class="node kind-{node.kind}"
						class:centre={n.id === centre}
						class:dim={hover !== null && hover !== n.id}
						transform="translate({n.x + ox},{n.y + oy})"
						role="button"
						tabindex="0"
						aria-label="{node.name}, {firstYear(node)}{n.id === centre ? ' (selected)' : ''}"
						onclick={() => select(n.id)}
						onkeydown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), select(n.id))}
						onpointerenter={() => (hover = n.id)}
						onpointerleave={() => (hover = null)}
					>
						<circle r={n.id === centre ? R + 3 : R} class="dot" />
						<text y={R + 15} class="label" text-anchor="middle">{node.name}</text>
						<text y={R + 28} class="year" text-anchor="middle">{firstYear(node)}</text>
					</g>
				{/each}
			</svg>
		{/if}
	</div>

	<div class="overlay key"><Legend /></div>
</div>

<style>
	.network {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		min-width: 0;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--line);
		font-size: var(--text-sm);
	}
	.counts,
	.lbl {
		color: var(--fg-muted);
	}
	.hops {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.scroller {
		position: relative;
		overflow: auto;
		flex: 1;
		min-height: 0;
		outline-offset: -2px;
		overscroll-behavior: contain;
	}
	svg {
		display: block;
		margin: 0 auto;
	}
	.empty {
		margin: var(--space-6) auto;
		max-width: 36ch;
		text-align: center;
		color: var(--fg-muted);
	}
	.overlay {
		position: absolute;
		bottom: 22px;
		left: var(--space-4);
		z-index: 5;
	}

	.edge {
		fill: none;
		stroke: var(--fam);
		stroke-width: 1.4;
		opacity: 0.6;
		transition: opacity var(--duration-fast);
	}
	.edge.fam-reaction {
		stroke-dasharray: 6 3;
	}
	.edge.conf-low {
		stroke-dasharray: 3 3;
	}
	.edges.filtering .edge {
		opacity: 0.1;
	}
	.edges.filtering .edge.hot,
	.edge:hover {
		opacity: 1;
		stroke-width: 2.4;
	}
	.arrowhead {
		fill: var(--fam);
	}

	.node {
		cursor: pointer;
		transition: opacity var(--duration-fast);
	}
	.node.dim {
		opacity: 0.35;
	}
	.node:focus-visible {
		outline: var(--focus-ring);
	}
	.dot {
		fill: var(--kind, var(--fg-faint));
		stroke: var(--bg);
		stroke-width: 2;
	}
	.centre .dot {
		stroke: var(--accent);
		stroke-width: 3;
	}
	.label {
		font-size: var(--text-sm);
		fill: var(--fg);
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 3px;
	}
	.centre .label {
		font-weight: 600;
	}
	.year,
	.more {
		font-size: var(--text-xs);
		fill: var(--fg-faint);
	}
</style>
