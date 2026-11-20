<script lang="ts">
	import { viewer } from '#lib/viewer.svelte.ts';
	import { FAMILIES } from '#lib/graph.ts';
	import { NOW } from '#lib/scale.ts';
	import Button from '../atoms/Button.svelte';
	import IconButton from '../atoms/IconButton.svelte';
	import Kbd from '../atoms/Kbd.svelte';
	import ToggleChip from '../atoms/ToggleChip.svelte';
	import FilterGroup from '../molecules/FilterGroup.svelte';

	const KINDS = ['mechanism', 'machine', 'machine-code', 'formalism', 'notation', 'assembly', 'language'];

	let showProblems = $state(false);

	const g = $derived(viewer.graph);
	const presentKinds = $derived(KINDS.filter((k) => g.data.nodes.some((n) => n.kind === k)));

	const conceptGroups = $derived.by(() => {
		const groups = new Map<string, { id: string; name: string }[]>();
		for (const c of [...g.data.concepts].sort((a, b) => a.name.localeCompare(b.name))) {
			const f = c.facet ?? 'other';
			(groups.get(f) ?? groups.set(f, []).get(f)!).push(c);
		}
		return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	const eras = $derived([...g.data.eras].sort((a, b) => a.start - b.start));
	// Eras may overlap; the latest-starting one containing the centre year wins (same rule as build.py).
	const activeEra = $derived.by(() => {
		if (viewer.pinnedEra) return viewer.pinnedEra;
		if (viewer.centerYear > NOW - 3) return 'now';
		const hits = eras.filter((e) => e.start <= viewer.centerYear && viewer.centerYear <= (e.end ?? NOW) + 1);
		return hits.at(-1)?.id ?? null;
	});
	const focusActive = $derived(viewer.selected !== null || viewer.concept !== null || viewer.lineage !== null);
	const showFilters = $derived(!viewer.narrow.current || viewer.filtersOpen);

	const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

	let flash = $state(false);
	$effect(() => {
		if (viewer.updates === 0) return;
		flash = true;
		const t = setTimeout(() => (flash = false), 900);
		return () => clearTimeout(t);
	});
</script>

<header class="toolbar">
	<h1 class="brand">History of languages</h1>

	<Button class="search-btn" onclick={() => (viewer.paletteOpen = true)} title="Go to a language, cluster, concept, lineage or era" aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
		<span class="search-icon" aria-hidden="true">⌕</span>
		<span class="search-text">Go to…</span>
		<span class="keys" aria-hidden="true"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
	</Button>
	<Button class="path-btn" onclick={() => (viewer.pathOpen = true)} title="How are two languages related? Shortest path between them (P)" aria-keyshortcuts="P">
		<span aria-hidden="true">⇄</span><span class="path-text">Path</span>
		<span class="keys" aria-hidden="true"><Kbd>P</Kbd></span>
	</Button>

	{#if viewer.narrow.current}
		<Button onclick={() => (viewer.filtersOpen = !viewer.filtersOpen)} aria-expanded={viewer.filtersOpen} aria-controls="filters">
			Filters{#if focusActive}<span aria-hidden="true"> •</span><span class="sr-only">(highlight active)</span>{/if}
		</Button>
	{/if}

	{#if showFilters}
		<div class="filters" id="filters">
			<FilterGroup legend="Edges">
				{#each FAMILIES as f (f.id)}
					<ToggleChip family={f.id} title={f.hint} checked={viewer.families.has(f.id)} onchange={() => viewer.toggle(viewer.families, f.id)}>{f.label}</ToggleChip>
				{/each}
			</FilterGroup>

			<FilterGroup legend="Kinds">
				{#each presentKinds as k (k)}
					<ToggleChip kind={k} checked={!viewer.hiddenKinds.has(k)} onchange={() => viewer.toggle(viewer.hiddenKinds, k)}>{k}</ToggleChip>
				{/each}
			</FilterGroup>

			<FilterGroup legend="Highlight">
				<select
					value={viewer.concept ?? ''}
					onchange={(e) => viewer.setConcept(e.currentTarget.value || null)}
					aria-label="Highlight a concept"
					title="Highlight nodes that have a concept (or a narrower one) and mark when it arrived"
				>
					<option value="">concept…</option>
					{#each conceptGroups as [facet, items] (facet)}
						<optgroup label={facet}>
							{#each items as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</optgroup>
					{/each}
				</select>
				<select value={viewer.lineage ?? ''} onchange={(e) => viewer.setLineage(e.currentTarget.value || null)} aria-label="Highlight a lineage" title="Highlight a narrative lineage">
					<option value="">lineage…</option>
					{#each g.data.lineages as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
				</select>
				<ToggleChip title="On selection, follow edges transitively or only one hop" checked={viewer.depth === 'full'} onchange={() => (viewer.depth = viewer.depth === 'full' ? 'direct' : 'full')}>transitive</ToggleChip>
			</FilterGroup>

			<FilterGroup legend="View">
				<Button onclick={() => viewer.expandAll()} title="Expand all clusters">expand</Button>
				<Button onclick={() => viewer.collapseAll()} title="Collapse all clusters">collapse</Button>
				<IconButton variant="bordered" label="Zoom out" onclick={() => viewer.setZoom(viewer.effectiveZoom / 1.4)}>−</IconButton>
				<output class="zoom" aria-label="Zoom level">{viewer.effectiveZoom.toFixed(2)}×</output>
				<IconButton variant="bordered" label="Zoom in" onclick={() => viewer.setZoom(viewer.effectiveZoom * 1.4)}>+</IconButton>
				{#if focusActive}
					<Button onclick={() => viewer.clearFocus()} title="Clear selection and highlights (Esc)">clear</Button>
				{/if}
			</FilterGroup>
		</div>
	{/if}

	<div class="status" class:flash>
		<span class="sr-only" role="status">{flash ? 'Data reloaded' : ''}</span>
		{#if g.data.problems.length}
			<Button class="problems" onclick={() => (showProblems = !showProblems)} aria-expanded={showProblems}>
				<span aria-hidden="true">⚠</span> {g.data.problems.length} problem{g.data.problems.length === 1 ? '' : 's'}
			</Button>
		{:else}
			<span class="ok" title="Lenient load OK. Run `task data:build` for full schema validation.">data ok</span>
		{/if}
		<span class="loaded" title="Last loaded from data/">{new Date(g.data.loadedAt).toLocaleTimeString()}</span>
		<Button
			onclick={() => (viewer.panelOpen = !viewer.panelOpen)}
			aria-expanded={viewer.panelOpen}
			title={viewer.panelOpen ? 'Fold the detail panel' : 'Open the detail panel'}
		>
			{viewer.panelOpen ? 'Hide details' : 'Details'}
		</Button>
		<a class="repo" href="https://github.com/sunsided/history-of-languages" target="_blank" rel="noreferrer" title="Source and dataset on GitHub" aria-label="GitHub repository (opens in a new tab)">
			<!-- Octicons mark-github (MIT) -->
			<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
				<path
					fill="currentColor"
					d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
				/>
			</svg>
		</a>
	</div>

	<nav class="eras" aria-label="Jump to era">
		{#each eras as e (e.id)}
			<Button
				variant="pill"
				class="era"
				aria-current={activeEra === e.id ? 'true' : undefined}
				onclick={() => viewer.jump(e.id)}
				title="{e.name} ({e.start < 0 ? `${-e.start} BC` : e.start}–{e.end ?? 'now'}){e.summary ? '\n' + e.summary : ''}"
			>
				<span class="era-year">{e.start < 0 ? `${-e.start} BC` : e.start}</span>
				<span class="era-name">{e.name}</span>
			</Button>
		{/each}
		<Button variant="pill" class="era now" aria-current={activeEra === 'now' ? 'true' : undefined} onclick={() => viewer.jump('now')} title="Scroll to the present">Now →</Button>
	</nav>
</header>

{#if showProblems && g.data.problems.length}
	<div class="problem-list" role="region" aria-label="Load problems">
		<div class="pl-head">
			<span>Load problems (lenient loader; run <code>task data:build</code> for full schema validation)</span>
			<Button onclick={() => (showProblems = false)}>close</Button>
		</div>
		<ul>
			{#each g.data.problems as p, i (i)}<li>{p}</li>{/each}
		</ul>
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		padding: var(--space-3) var(--space-5);
		border-bottom: 1px solid var(--line);
		background: var(--bg-raised);
		font-size: var(--text-sm);
	}
	.brand {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-base);
		letter-spacing: -0.01em;
	}
	.filters {
		display: contents;
	}
	.toolbar :global(.search-btn) {
		width: 220px;
		color: var(--fg-subtle);
	}
	.search-text {
		flex: 1;
		text-align: left;
	}
	.toolbar :global(.path-btn) {
		color: var(--fg-muted);
	}
	.search-icon {
		font-size: var(--text-lg);
		line-height: 1;
	}
	.keys {
		display: inline-flex;
		gap: var(--space-1);
	}
	select {
		max-width: 180px;
		min-height: var(--target-min);
		font: inherit;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 0 var(--space-3);
	}
	.zoom {
		min-width: 40px;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--fg-muted);
	}
	.status {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		transition: background var(--duration-slow);
	}
	.status.flash {
		background: var(--accent-soft);
		transition: none;
	}
	.status :global(.problems) {
		color: var(--warn);
		border-color: var(--warn);
	}
	.ok {
		color: var(--rs-reviewed);
	}
	.loaded {
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}
	.repo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--target-min);
		min-height: var(--target-min);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
	}
	.repo:hover {
		color: var(--fg);
		background: var(--hover);
	}
	.eras {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		scrollbar-width: thin;
		padding-bottom: var(--space-1);
	}
	.eras :global(.era) {
		flex: none;
		align-items: baseline;
		max-width: 220px;
		white-space: nowrap;
		padding-top: 3px;
	}
	.eras :global(.era[aria-current='true']) {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.era-year {
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-xs);
	}
	.era-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.eras :global(.now) {
		margin-left: auto;
		font-weight: 600;
	}
	.problem-list {
		position: absolute;
		z-index: var(--z-popover);
		right: var(--space-5);
		top: 46px;
		width: min(720px, calc(100vw - 24px));
		max-height: 60vh;
		overflow: auto;
		background: var(--bg-raised);
		border: 1px solid var(--warn);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-popover);
		font-size: var(--text-sm);
	}
	.pl-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) 10px;
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		background: var(--bg-raised);
	}
	.problem-list ul {
		margin: 0;
		padding: var(--space-4) 10px 10px 28px;
		font-family: var(--mono);
		font-size: var(--text-sm);
	}
	@media (max-width: 899px) {
		.toolbar {
			gap: var(--space-3) var(--space-4);
			padding: var(--space-3) 10px;
		}
		/* the title stays in the accessibility tree as the page heading */
		.brand {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.toolbar :global(.search-btn) {
			flex: 1;
			min-width: 0;
			width: auto;
		}
		.keys {
			display: none;
		}
		/* icon-only on narrow screens; the word stays as the button's name */
		.path-text {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.filters {
			display: flex;
			flex-direction: column;
			gap: var(--space-4);
			flex-basis: 100%;
			order: 5;
			padding: var(--space-3) 0;
			border-top: 1px solid var(--line);
		}
		.status {
			margin-left: 0;
			gap: var(--space-3);
		}
		.loaded {
			display: none;
		}
		.eras {
			order: 6;
			flex-wrap: nowrap;
			overflow-x: auto;
		}
		.era-name {
			display: none;
		}
		.eras :global(.era:hover .era-name),
		.eras :global(.era[aria-current='true'] .era-name) {
			display: inline;
		}
	}
</style>
