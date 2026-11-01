<script lang="ts">
	import { untrack } from 'svelte';
	import { viewer } from '../viewer.svelte.ts';
	import { querySearch, type SearchHit } from '../search.ts';
	import { firstYear, FAMILY_OF } from '../graph.ts';
	import { shortestPath, type Hop } from '../path.ts';

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

	function onWindowKey(ev: KeyboardEvent) {
		if (ev.key === 'Escape') {
			ev.preventDefault();
			close();
		}
	}

	const [a, b] = $derived(picks);
	const path = $derived(a && b && a !== b ? shortestPath(g, a, b) : null);

	function goTo(id: string) {
		viewer.selectNode(id);
		close();
	}

	/** on open, focus the first side still to pick */
	const focusFirstEmpty = (side: 0 | 1) => (el: HTMLInputElement) => {
		if (untrack(() => side === (picks[0] ? 1 : 0))) el.focus();
	};

	const name = (id: string) => g.node.get(id)?.name ?? id;
	const year = (id: string) => {
		const n = g.node.get(id);
		if (!n) return '';
		const y = firstYear(n);
		return y < 0 ? `${-y} BC` : String(y);
	};
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet nodeRow(id: string)}
	{@const n = g.node.get(id)}
	<button class="node" onclick={() => goTo(id)} title="Show {name(id)} on the timeline">
		<span class="kind-dot kind-{n?.kind}"></span>
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
				<li class="hop fam-{FAMILY_OF[h.edge.type]}" class:weak={h.edge.confidence === 'low'}>
					<span class="rel">{name(h.from)} <b>{h.label}</b> {name(h.to)}</span>
					{#if h.edge.weight || h.edge.confidence}
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
				<button class="clear" onclick={() => clear(side)} title="Pick another language" aria-label="Clear">×</button>
			</div>
		{:else}
			<input
				{@attach focusFirstEmpty(side)}
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
				<ul class="results" role="listbox">
					{#each results[side] as h, i (h.entry.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li
							role="option"
							aria-selected={i === active[side]}
							class:active={i === active[side]}
							onpointermove={() => (active[side] = i)}
							onclick={() => pick(side, h.entry.id)}
						>
							<span class="kind-dot kind-{h.entry.kind}"></span>
							<span class="node-name">{h.entry.label}</span>
							<span class="node-year">{h.entry.year !== undefined ? (h.entry.year < 0 ? `${-h.entry.year} BC` : h.entry.year) : ''}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close}>
	<div class="dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="Path between two languages" onclick={(e) => e.stopPropagation()}>
		<header>
			<h2>How are they related?</h2>
			<button class="close" onclick={close} title="Close (Esc)" aria-label="Close">×</button>
		</header>

		<div class="pickers">
			{@render picker(0)}
			<button class="swap" onclick={swap} title="Swap" aria-label="Swap the two languages" disabled={!a && !b}>⇄</button>
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
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgb(0 0 0 / 0.32);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 10vh 16px 16px;
	}
	.dialog {
		width: min(760px, 100%);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.35);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
	}
	h2 {
		margin: 0;
		font-size: 15px;
		flex: 1;
	}
	.close,
	.clear {
		border: none;
		background: none;
		color: var(--fg-muted);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
	}
	.close:hover,
	.clear:hover {
		background: var(--hover);
		color: var(--fg);
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
		font-size: 14px;
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: 6px;
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
		border-radius: 6px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
	}
	.results li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 7px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 13px;
	}
	.results li.active {
		background: var(--accent-soft);
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: 4px;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--bg);
		padding: 1px 2px 1px 0;
	}
	.chosen .node {
		flex: 1;
	}
	.swap {
		margin-top: 4px;
		font-size: 16px;
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg-muted);
		cursor: pointer;
	}
	.swap:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.body {
		overflow-y: auto;
		padding: 6px 14px 14px;
	}
	.route h3 {
		font-size: 12px;
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
		font-size: 14px;
		padding: 5px 8px;
		border-radius: 5px;
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
		font-size: 12px;
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
		font-size: 12px;
		color: var(--fg-muted);
	}
	.hop.weak {
		border-left-style: dashed;
	}
	.hop b {
		color: var(--fam, var(--fg));
		font-weight: 600;
	}
	.fam-succession {
		--fam: var(--fam-succession);
	}
	.fam-influence {
		--fam: var(--fam-influence);
	}
	.fam-variant {
		--fam: var(--fam-variant);
	}
	.fam-targets {
		--fam: var(--fam-targets);
	}
	.fam-implementation {
		--fam: var(--fam-implementation);
	}
	.muted {
		color: var(--fg-faint);
	}
	.kind-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
		background: var(--k, var(--fg-faint));
	}
	.kind-mechanism {
		--k: var(--kind-mechanism);
	}
	.kind-machine {
		--k: var(--kind-machine);
	}
	.kind-machine-code {
		--k: var(--kind-machine-code);
	}
	.kind-formalism {
		--k: var(--kind-formalism);
	}
	.kind-notation {
		--k: var(--kind-notation);
	}
	.kind-assembly {
		--k: var(--kind-assembly);
	}
	.kind-language {
		--k: var(--kind-language);
	}

	@media (max-width: 899px) {
		.backdrop {
			padding: 8px;
		}
		.dialog {
			max-height: calc(100dvh - 16px);
		}
		.pickers {
			grid-template-columns: minmax(0, 1fr);
		}
		.swap {
			justify-self: center;
			margin: 0;
			transform: rotate(90deg);
		}
	}
</style>
