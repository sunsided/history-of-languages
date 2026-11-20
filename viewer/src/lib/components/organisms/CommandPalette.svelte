<script lang="ts">
	import { viewer } from '#lib/viewer.svelte.ts';
	import { querySearch, type SearchEntry, type SearchHit } from '#lib/search.ts';
	import Dialog from '../molecules/Dialog.svelte';
	import Kbd from '../atoms/Kbd.svelte';
	import KindDot from '../atoms/KindDot.svelte';

	let query = $state('');
	let active = $state(0);
	let list: HTMLUListElement | undefined = $state();

	const byKey = $derived(new Map(viewer.searchIndex.entries.map((e) => [`${e.type}:${e.id}`, e])));

	interface Section {
		title: string;
		hits: SearchHit[];
	}

	const sections = $derived.by((): Section[] => {
		if (query.trim()) return [{ title: '', hits: querySearch(viewer.searchIndex, query) }];
		const recent = viewer.recent
			.map((k) => byKey.get(k))
			.filter((e): e is SearchEntry => !!e)
			.map((entry) => ({ entry, score: 0 }));
		const eras = viewer.searchIndex.entries
			.filter((e) => e.type === 'era')
			.sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
			.map((entry) => ({ entry, score: 0 }));
		return [
			...(recent.length ? [{ title: 'Recent', hits: recent }] : []),
			{ title: 'Eras', hits: eras }
		];
	});
	const flat = $derived(sections.flatMap((s) => s.hits));

	function choose(hit: SearchHit | undefined) {
		if (hit) viewer.go(hit.entry);
	}

	function close() {
		viewer.paletteOpen = false;
	}

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'ArrowDown' || (ev.key === 'Tab' && !ev.shiftKey)) {
			active = (active + 1) % Math.max(1, flat.length);
		} else if (ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey)) {
			active = (active - 1 + flat.length) % Math.max(1, flat.length);
		} else if (ev.key === 'PageDown') {
			active = Math.min(flat.length - 1, active + 8);
		} else if (ev.key === 'PageUp') {
			active = Math.max(0, active - 8);
		} else if (ev.key === 'Enter') {
			choose(flat[active]);
		} else return;
		ev.preventDefault();
		requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
	}

	const TYPE_LABEL: Record<SearchEntry['type'], string> = {
		node: '',
		cluster: 'cluster',
		lineage: 'lineage',
		concept: 'concept',
		era: 'era'
	};
</script>

<Dialog label="Go to" onclose={close}>
		<div class="input-row">
			<span class="icon" aria-hidden="true">⌕</span>
			<input
				data-autofocus
				bind:value={query}
				oninput={() => (active = 0)}
				onkeydown={onKey}
				placeholder="Go to language, cluster, concept, lineage or era…"
				aria-label="Search"
				aria-controls="palette-results"
				aria-activedescendant={flat[active] ? `pal-${active}` : undefined}
				role="combobox"
				aria-expanded="true"
				aria-autocomplete="list"
				autocomplete="off"
				spellcheck="false"
			/>
			<Kbd>Esc</Kbd>
		</div>

		<ul class="results" id="palette-results" role="listbox" bind:this={list}>
			{#each sections as section (section.title)}
				{#if section.title}<li class="section" role="presentation">{section.title}</li>{/if}
				{#each section.hits as hit (hit.entry.type + hit.entry.id)}
					{@const i = flat.indexOf(hit)}
					{@const e = hit.entry}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id="pal-{i}"
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						onpointermove={() => (active = i)}
						onclick={() => choose(hit)}
					>
						<KindDot kind={e.kind ?? e.type} />
						<span class="label">
							{#if hit.range}
								{e.label.slice(0, hit.range[0])}<mark>{e.label.slice(hit.range[0], hit.range[1])}</mark>{e.label.slice(hit.range[1])}
							{:else}
								{e.label}
							{/if}
							{#if e.hasExample}<span class="code-mark" title="has a code example">&lt;/&gt;</span>{/if}
						</span>
						{#if hit.snippet}
							<span class="detail snippet">{hit.snippet[0]}<mark>{hit.snippet[1]}</mark>{hit.snippet[2]}</span>
						{:else}
							<span class="detail">{e.detail}</span>
						{/if}
						{#if TYPE_LABEL[e.type]}<span class="type">{TYPE_LABEL[e.type]}</span>{/if}
						{#if e.year !== undefined}<span class="year">{e.year < 0 ? `${-e.year} BC` : e.year}</span>{/if}
					</li>
				{/each}
			{/each}
			{#if query.trim() && flat.length === 0}
				<li class="empty" role="presentation">No match for “{query}”.</li>
			{/if}
		</ul>

		<p class="sr-only" role="status">{query.trim() ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}</p>

		<div class="footer">
			<span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
			<span><Kbd>Enter</Kbd> go</span>
			<span><Kbd>Ctrl</Kbd><Kbd>K</Kbd> toggle</span>
			<span class="count">{viewer.searchIndex.entries.length} entries indexed</span>
		</div>
</Dialog>

<style>
	.input-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line);
	}
	.icon {
		font-size: 18px;
		color: var(--fg-subtle);
	}
	input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: var(--text-lg);
		border: none;
		outline: none;
		background: transparent;
		color: var(--fg);
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 4px;
		overflow-y: auto;
	}
	.results li[role='option'] {
		display: grid;
		grid-template-columns: 10px minmax(0, auto) minmax(0, 1fr) auto auto;
		align-items: baseline;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: var(--text-md);
	}
	.results :global(.kind-dot) {
		align-self: center;
	}
	.results :global(.kind-cluster),
	.results :global(.kind-era) {
		border-radius: 2px;
	}
	.results li.active {
		background: var(--accent-soft);
	}
	.section {
		padding: 8px 8px 3px;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-subtle);
	}
	.label {
		font-weight: 600;
		white-space: nowrap;
	}
	mark {
		background: none;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.code-mark {
		margin-left: 5px;
		font-family: var(--mono);
		font-size: var(--text-2xs);
		color: var(--accent);
		font-weight: 400;
	}
	.detail {
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
.snippet {
		font-style: italic;
	}
	.snippet mark {
		font-style: normal;
	}
	.type {
		font-size: var(--text-2xs);
		padding: 0 5px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
	}
	.year {
		font-variant-numeric: tabular-nums;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		min-width: 44px;
		text-align: right;
	}
	.empty {
		padding: 16px;
		color: var(--fg-muted);
		text-align: center;
	}
	.footer :global(kbd) {
		margin-right: var(--space-1);
	}
	.footer {
		display: flex;
		gap: 14px;
		padding: 7px 12px;
		border-top: 1px solid var(--line);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.footer .count {
		margin-left: auto;
	}

	@media (max-width: 899px) {
		.results li[role='option'] {
			grid-template-columns: 10px minmax(0, 1fr) auto;
		}
		.detail,
		.type {
			display: none;
		}
		.footer span:not(.count) {
			display: none;
		}
	}
</style>
