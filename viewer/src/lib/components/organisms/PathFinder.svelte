<script lang="ts">
	import { untrack } from 'svelte';
	import { viewer } from '#lib/viewer.svelte.ts';
	import { querySearch, type SearchHit } from '#lib/search.ts';
	import { firstYear, FAMILY_OF } from '#lib/graph.ts';
	import { shortestPath, type Hop, type Via } from '#lib/path.ts';
	import Dialog from '../molecules/Dialog.svelte';
	import IconButton from '../atoms/IconButton.svelte';
	import KindDot from '../atoms/KindDot.svelte';

	const g = $derived(viewer.graph);

	// Start from the selected language, if any.
	const sel = viewer.selected?.type === 'node' ? viewer.selected.id : null;
	let picks = $state<[string | null, string | null]>([sel && viewer.graph.node.has(sel) ? sel : null, null]);
	let queries = $state(['', '']);
	let active = $state([0, 0]);
	let inputs: (HTMLInputElement | undefined)[] = $state([undefined, undefined]);

	function hits(q: string): SearchHit[] {
		if (!q.trim()) return [];
		const nodes = querySearch(viewer.searchIndex, q, 80).filter((h) => h.entry.type === 'node');
		const byName = nodes.filter((h) => !h.snippet); // prose matches only when no name matches
		return (byName.length ? byName : nodes).slice(0, 8);
	}
	const results = $derived([hits(queries[0]), hits(queries[1])]);

	function pick(side: 0 | 1, id: string) {
		picks[side] = id;
		queries[side] = '';
		active[side] = 0;
		const other = (1 - side) as 0 | 1;
		if (!picks[other]) requestAnimationFrame(() => inputs[other]?.focus());
	}

	function clear(side: 0 | 1) {
		picks[side] = null;
		requestAnimationFrame(() => inputs[side]?.focus());
	}

	function swap() {
		picks = [picks[1], picks[0]];
	}

	function close() {
		viewer.pathOpen = false;
	}

	function onKey(side: 0 | 1, ev: KeyboardEvent) {
		const list = results[side];
		if (ev.key === 'ArrowDown') active[side] = (active[side] + 1) % Math.max(1, list.length);
		else if (ev.key === 'ArrowUp') active[side] = (active[side] - 1 + list.length) % Math.max(1, list.length);
		else if (ev.key === 'Enter' && list[active[side]]) pick(side, list[active[side]].entry.id);
		else if (ev.key === 'Backspace' && !queries[side] && picks[side]) picks[side] = null;
		else return;
		ev.preventDefault();
	}

	const [a, b] = $derived(picks);
	const path = $derived(a && b && a !== b ? shortestPath(g, a, b) : null);

	function goTo(id: string) {
		viewer.selectNode(id);
		close();
	}

	/** on open, focus the first side still to pick */
	const firstEmpty = untrack(() => (picks[0] ? 1 : 0));

	const name = (id: string) => g.node.get(id)?.name ?? id;
	const viaText = (v: Via) =>
		v.kind === 'concept' ? `concept: ${g.concept.get(v.value)?.name ?? v.value}` : v.kind === 'person' ? v.value : `institution: ${v.value}`;
	const year = (id: string) => {
		const n = g.node.get(id);
		if (!n) return '';
		const y = firstYear(n);
		return y < 0 ? `${-y} BC` : String(y);
	};
</script>

{#snippet nodeRow(id: string)}
	{@const n = g.node.get(id)}
	<button class="node" onclick={() => goTo(id)} title="Show {name(id)} on the timeline">
		<KindDot kind={n?.kind ?? ''} />
		<span class="node-name">{name(id)}</span>
		<span class="node-year">{year(id)}</span>
	</button>
{/snippet}

{#snippet route(title: string, hops: Hop[], start: string)}
	<section class="route">
		<h3>{title} <span class="muted">· {hops.length} step{hops.length === 1 ? '' : 's'}</span></h3>
		<ol>
			<li>{@render nodeRow(start)}</li>
			{#each hops as h, i (i)}
				<li class="hop fam-{h.edge ? FAMILY_OF[h.edge.type] : 'derived'}" class:weak={h.edge?.confidence === 'low'} class:derived={!h.edge}>
					<span class="rel">{name(h.from)} <b>{h.label}</b> {name(h.to)}</span>
					{#if h.via}
						<span class="muted">{viaText(h.via)}</span>
					{:else if h.edge && (h.edge.weight || h.edge.confidence)}
						<span class="muted">{[h.edge.weight, h.edge.confidence && `${h.edge.confidence} confidence`].filter(Boolean).join(' · ')}</span>
					{/if}
				</li>
				<li>{@render nodeRow(h.to)}</li>
			{/each}
		</ol>
	</section>
{/snippet}

{#snippet picker(side: 0 | 1)}
	{@const id = picks[side]}
	<div class="picker">
		{#if id}
			<div class="chosen">
				{@render nodeRow(id)}
				<IconButton label="Pick another language" onclick={() => clear(side)}>×</IconButton>
			</div>
		{:else}
			<input
				data-autofocus={side === firstEmpty ? '' : undefined}
				role="combobox"
				aria-expanded={results[side].length > 0}
				aria-controls="pf-results-{side}"
				aria-autocomplete="list"
				aria-activedescendant={results[side][active[side]] ? `pf-${side}-${active[side]}` : undefined}
				bind:this={inputs[side]}
				bind:value={queries[side]}
				oninput={() => (active[side] = 0)}
				onkeydown={(ev) => onKey(side, ev)}
				placeholder={side === 0 ? 'From language…' : 'To language…'}
				aria-label={side === 0 ? 'From language' : 'To language'}
				autocomplete="off"
				spellcheck="false"
			/>
			{#if results[side].length}
				<ul class="results" id="pf-results-{side}" role="listbox" aria-label={side === 0 ? 'From language' : 'To language'}>
					{#each results[side] as h, i (h.entry.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li
							id="pf-{side}-{i}"
							role="option"
							aria-selected={i === active[side]}
							class:active={i === active[side]}
							onpointermove={() => (active[side] = i)}
							onclick={() => pick(side, h.entry.id)}
						>
							<KindDot kind={h.entry.kind ?? ''} />
							<span class="node-name">{h.entry.label}</span>
							<span class="node-year">{h.entry.year !== undefined ? (h.entry.year < 0 ? `${-h.entry.year} BC` : h.entry.year) : ''}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/snippet}

<Dialog label="Path between two languages" width="760px" top="10vh" maxHeight="80vh" onclose={close}>
		<header>
			<h2>How are they related?</h2>
			<IconButton label="Close" title="Close (Esc)" onclick={close}>×</IconButton>
		</header>

		<div class="pickers">
			{@render picker(0)}
			<IconButton variant="bordered" class="swap" label="Swap the two languages" onclick={swap} disabled={!a && !b}>⇄</IconButton>
			{@render picker(1)}
		</div>

		<div class="body">
			{#if a && b && a === b}
				<section class="route">
					<h3>Same language</h3>
					<ol><li>{@render nodeRow(a)}</li></ol>
				</section>
			{:else if a && b}
				{#if path}
					{@render route('Shortest path', path, a)}
				{:else}
					<p class="muted">No connection between {name(a)} and {name(b)} in the dataset yet.</p>
				{/if}
			{:else}
				<p class="muted">
					Pick two languages to see the shortest chain of relations between them (successors, dialects, forks,
					influence, targets, implementation). Among equally short chains, strong and well-sourced links win.
				</p>
			{/if}
		</div>
</Dialog>

<style>
	header {
		display: flex;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
	}
	h2 {
		margin: 0;
		font-size: var(--text-lg);
		flex: 1;
	}
	.pickers {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		gap: 8px;
		align-items: start;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line);
	}
	.picker {
		position: relative;
		min-width: 0;
	}
	input {
		width: 100%;
		font: inherit;
		font-size: var(--text-base);
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg);
		color: var(--fg);
		outline: none;
	}
	input:focus {
		border-color: var(--accent);
	}
	.results {
		position: absolute;
		z-index: 2;
		left: 0;
		right: 0;
		top: calc(100% + 4px);
		list-style: none;
		margin: 0;
		padding: 4px;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-popover);
	}
	.results li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 7px;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: var(--text-md);
	}
	.results li.active {
		background: var(--accent-soft);
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: 4px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		background: var(--bg);
		padding: 1px 2px 1px 0;
	}
	.chosen .node {
		flex: 1;
	}
	.pickers :global(.swap) {
		margin-top: var(--space-1);
		min-height: 32px;
		font-size: var(--text-lg);
	}
	.body {
		overflow-y: auto;
		padding: 6px 14px 14px;
	}
	.route h3 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--fg-muted);
		margin: 12px 0 6px;
	}
	.route h3 .muted {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.node {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: none;
		background: none;
		color: var(--fg);
		font: inherit;
		font-size: var(--text-base);
		padding: 5px 8px;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
	}
	.node:hover {
		background: var(--hover);
	}
	.node-name {
		font-weight: 600;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.node-year {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.hop {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin-left: 11px;
		padding: 3px 0 3px 14px;
		border-left: 2px solid var(--fam, var(--line));
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.hop.weak {
		border-left-style: dashed;
	}
	.hop b {
		color: var(--fam, var(--fg));
		font-weight: 600;
	}
	.fam-derived {
		--fam: var(--fg-muted);
	}
	.hop.derived {
		border-left-style: dotted;
	}
	.muted {
		color: var(--fg-subtle);
	}

	@media (max-width: 899px) {
		.pickers {
			grid-template-columns: minmax(0, 1fr);
		}
		.pickers :global(.swap) {
			justify-self: center;
			margin: 0;
			transform: rotate(90deg);
		}
	}
</style>
