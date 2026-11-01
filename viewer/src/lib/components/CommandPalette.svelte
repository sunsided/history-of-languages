<script lang="ts">
	import { viewer } from '../viewer.svelte.ts';
	import { querySearch, type SearchEntry, type SearchHit } from '../search.ts';

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
		} else if (ev.key === 'Escape') {
			close();
		} else return;
		ev.preventDefault();
		requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
	}

	function focusOnMount(el: HTMLInputElement) {
		el.focus();
	}

	const TYPE_LABEL: Record<SearchEntry['type'], string> = {
		node: '',
		cluster: 'cluster',
		lineage: 'lineage',
		concept: 'concept',
		era: 'era'
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close}>
	<div class="palette" role="dialog" tabindex="-1" aria-modal="true" aria-label="Go to" onclick={(e) => e.stopPropagation()}>
		<div class="input-row">
			<span class="icon" aria-hidden="true">⌕</span>
			<input
				{@attach focusOnMount}
				bind:value={query}
				oninput={() => (active = 0)}
				onkeydown={onKey}
				placeholder="Go to language, cluster, concept, lineage or era…"
				aria-label="Search"
				aria-controls="palette-results"
				aria-activedescendant={flat[active] ? `pal-${active}` : undefined}
				role="combobox"
				aria-expanded="true"
				autocomplete="off"
				spellcheck="false"
			/>
			<kbd>Esc</kbd>
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
						<span class="kind-dot kind-{e.kind ?? e.type}"></span>
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

		<div class="footer">
			<span><kbd>↑</kbd><kbd>↓</kbd> move</span>
			<span><kbd>Enter</kbd> go</span>
			<span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
			<span class="count">{viewer.searchIndex.entries.length} entries indexed</span>
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
		padding: 12vh 16px 16px;
	}
	.palette {
		width: min(640px, 100%);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.35);
		overflow: hidden;
	}
	.input-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line);
	}
	.icon {
		font-size: 18px;
		color: var(--fg-faint);
	}
	input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 15px;
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
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
	}
	.results li.active {
		background: var(--accent-soft);
	}
	.section {
		padding: 8px 8px 3px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-faint);
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
		font-size: 10px;
		color: var(--accent);
		font-weight: 400;
	}
	.detail {
		color: var(--fg-faint);
		font-size: 11.5px;
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
		font-size: 10px;
		padding: 0 5px;
		border: 1px solid var(--line);
		border-radius: 3px;
		color: var(--fg-muted);
	}
	.year {
		font-variant-numeric: tabular-nums;
		color: var(--fg-muted);
		font-size: 12px;
		min-width: 44px;
		text-align: right;
	}
	.empty {
		padding: 16px;
		color: var(--fg-muted);
		text-align: center;
	}
	.footer {
		display: flex;
		gap: 14px;
		padding: 7px 12px;
		border-top: 1px solid var(--line);
		font-size: 11px;
		color: var(--fg-faint);
	}
	.footer .count {
		margin-left: auto;
	}
	kbd {
		font-family: var(--mono);
		font-size: 10.5px;
		padding: 0 4px;
		margin-right: 2px;
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 3px;
		background: var(--bg);
		color: var(--fg-muted);
	}
	.kind-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		align-self: center;
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
	.kind-cluster,
	.kind-era {
		border-radius: 2px;
	}
	.kind-concept {
		--k: var(--warn);
	}
	.kind-lineage {
		--k: var(--rs-reviewed);
	}

	@media (max-width: 899px) {
		.backdrop {
			padding: 8px;
		}
		.palette {
			max-height: calc(100dvh - 16px);
		}
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
