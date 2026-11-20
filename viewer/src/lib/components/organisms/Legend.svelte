<script lang="ts">
	import { viewer } from '#lib/viewer.svelte.ts';
	import { FAMILIES } from '#lib/graph.ts';
	import ToggleChip from '../atoms/ToggleChip.svelte';

	const KINDS = ['mechanism', 'machine', 'machine-code', 'formalism', 'notation', 'assembly', 'language'];
	const open = $derived(viewer.narrow.current ? viewer.legendOpenNarrow : viewer.legendOpen);
	function toggle() {
		if (viewer.narrow.current) viewer.legendOpenNarrow = !viewer.legendOpenNarrow;
		else viewer.legendOpen = !viewer.legendOpen;
	}
	const presentKinds = $derived(KINDS.filter((k) => viewer.graph.data.nodes.some((n) => n.kind === k)));
</script>

<!-- The key explains every mark on the timeline, and its edge and kind entries are the filters:
     the swatch you read is the control you press. -->
<section class="legend" aria-labelledby="legend-toggle">
	<h2 class="head-wrap">
	<button
		id="legend-toggle"
		class="head"
		aria-expanded={open}
		aria-controls="legend-body"
		onclick={toggle}
	>
		<span class="chev" class:open aria-hidden="true">▸</span>
		Key
		{#if viewer.filterCount}<span class="badge">{viewer.filterCount}<span class="sr-only"> filters changed</span></span>{/if}
	</button>
	</h2>

	{#if open}
		<div class="body" id="legend-body">
			<fieldset>
				<legend>Relations</legend>
				{#each FAMILIES as f (f.id)}
					<ToggleChip family={f.id} title={f.hint} checked={viewer.families.has(f.id)} onchange={() => viewer.toggle(viewer.families, f.id)}>{f.label}</ToggleChip>
				{/each}
			</fieldset>
			<fieldset>
				<legend>Kinds</legend>
				{#each presentKinds as k (k)}
					<ToggleChip kind={k} checked={!viewer.hiddenKinds.has(k)} onchange={() => viewer.toggle(viewer.hiddenKinds, k)}>{k}</ToggleChip>
				{/each}
			</fieldset>

			<h3>Marks</h3>
			<ul class="marks kind-language">
				<li>
					<svg width="34" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" class="dot rs-stub" /><circle cx="27" cy="7" r="5" class="dot" /></svg>
					first appeared: stub, draft
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><circle cx="17" cy="7" r="5" class="dot rs-reviewed" /></svg>
					reviewed
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><rect x="2" y="4" width="22" height="6" rx="3" class="design" /><circle cx="27" cy="7" r="5" class="dot" /></svg>
					design period before it
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><line x1="2" x2="32" y1="7" y2="7" class="life" /><line x1="12" x2="12" y1="2" y2="12" class="tick" /><line x1="24" x2="24" y1="2" y2="12" class="tick" /></svg>
					alive, ticks = versions
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><line x1="2" x2="30" y1="7" y2="7" class="life ended" /><line x1="30" x2="30" y1="3" y2="11" class="ended" /></svg>
					ended (historical, extinct)
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><line x1="2" x2="32" y1="7" y2="7" class="life legacy" /></svg>
					legacy
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><path d="M2,11 C14,11 20,3 32,3" class="edge low" /></svg>
					low-confidence relation
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><path d="M17,0 l6,7 l-6,7 l-6,-7 z" class="arrival" /></svg>
					concept arrives (highlight)
				</li>
				<li>
					<svg width="34" height="14" aria-hidden="true"><circle cx="17" cy="7" r="4" class="backlog" /></svg>
					not yet researched (backlog)
				</li>
			</ul>
		</div>
	{/if}
</section>

<style>
	.legend {
		width: 248px;
		max-height: min(60vh, 520px);
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-tooltip);
		font-size: var(--text-sm);
	}
	.head-wrap {
		margin: 0;
		font-size: inherit;
	}
	.head {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 32px;
		padding: 0 var(--space-4);
		font: inherit;
		font-weight: 600;
		color: var(--fg);
		background: none;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
	}
	.head:hover {
		background: var(--hover);
	}
	.chev {
		display: inline-block;
		transition: transform var(--duration-fast);
		color: var(--fg-muted);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.badge {
		min-width: 18px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--bg);
		font-size: var(--text-xs);
		text-align: center;
	}
	.body {
		overflow-y: auto;
		padding: 0 var(--space-4) var(--space-4);
		border-top: 1px solid var(--line);
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: none;
	}
	legend,
	h3 {
		width: 100%;
		margin: var(--space-4) 0 var(--space-2);
		padding: 0;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
	}
	.marks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
		color: var(--fg-muted);
	}
	.marks li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	svg {
		flex: none;
	}
	/* same marks as the timeline plot */
	.dot {
		fill: var(--kind);
		stroke: var(--bg);
		stroke-width: 1.5;
	}
	.dot.rs-stub {
		fill: var(--bg);
		stroke: var(--kind);
		stroke-width: 1.8;
	}
	.dot.rs-reviewed {
		stroke: var(--rs-reviewed);
		stroke-width: 2.2;
	}
	.design {
		fill: var(--kind);
		opacity: 0.25;
	}
	.life {
		stroke: var(--fg-muted);
		stroke-width: 2.5;
	}
	.life.ended,
	.ended {
		stroke: var(--fg-faint);
		stroke-width: 2;
	}
	.life.legacy {
		stroke-dasharray: 6 3;
	}
	.tick {
		stroke: var(--fg-muted);
		stroke-width: 1.5;
	}
	.edge {
		fill: none;
		stroke: var(--fg-muted);
		stroke-width: 1.5;
	}
	.edge.low {
		stroke-dasharray: 3 3;
	}
	.arrival {
		fill: var(--warn);
	}
	.backlog {
		fill: none;
		stroke: var(--fg-faint);
		stroke-dasharray: 2 2;
	}
</style>
