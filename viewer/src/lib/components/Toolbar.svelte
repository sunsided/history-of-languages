<script lang="ts">
	import { viewer } from '../viewer.svelte.ts';
	import { FAMILIES } from '../graph.ts';
	import { NOW } from '../scale.ts';

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
	<div class="brand">History of languages</div>

	<button class="search-btn" onclick={() => (viewer.paletteOpen = true)} title="Go to a language, cluster, concept, lineage or era">
		<span class="search-icon" aria-hidden="true">⌕</span>
		<span class="search-text">Go to…</span>
		<kbd>{isMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd>
	</button>

	{#if viewer.narrow.current}
		<button class="toggle" class:on={viewer.filtersOpen} onclick={() => (viewer.filtersOpen = !viewer.filtersOpen)} aria-expanded={viewer.filtersOpen}>
			Filters{focusActive ? ' •' : ''}
		</button>
	{/if}

	{#if showFilters}
	<div class="filters">
	<fieldset class="group">
		<legend>Edges</legend>
		{#each FAMILIES as f (f.id)}
			<label class="chip fam-{f.id}" title={f.hint}>
				<input type="checkbox" checked={viewer.families.has(f.id)} onchange={() => viewer.toggle(viewer.families, f.id)} />
				<span class="swatch"></span>{f.label}
			</label>
		{/each}
	</fieldset>

	<fieldset class="group">
		<legend>Kinds</legend>
		{#each presentKinds as k (k)}
			<label class="chip kind-{k}">
				<input type="checkbox" checked={!viewer.hiddenKinds.has(k)} onchange={() => viewer.toggle(viewer.hiddenKinds, k)} />
				<span class="swatch round"></span>{k}
			</label>
		{/each}
	</fieldset>

	<fieldset class="group">
		<legend>Highlight</legend>
		<select
			value={viewer.concept ?? ''}
			onchange={(e) => viewer.setConcept(e.currentTarget.value || null)}
			title="Highlight nodes that have a concept (or a narrower one) and mark when it arrived"
		>
			<option value="">concept…</option>
			{#each conceptGroups as [facet, items] (facet)}
				<optgroup label={facet}>
					{#each items as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</optgroup>
			{/each}
		</select>
		<select
			value={viewer.lineage ?? ''}
			onchange={(e) => viewer.setLineage(e.currentTarget.value || null)}
			title="Highlight a narrative lineage"
		>
			<option value="">lineage…</option>
			{#each g.data.lineages as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
		</select>
		<label class="chip" title="On selection, follow edges transitively or only one hop">
			<input type="checkbox" checked={viewer.depth === 'full'} onchange={() => (viewer.depth = viewer.depth === 'full' ? 'direct' : 'full')} />
			transitive
		</label>
	</fieldset>

	<fieldset class="group">
		<legend>View</legend>
		<button onclick={() => viewer.expandAll()} title="Expand all clusters">expand</button>
		<button onclick={() => viewer.collapseAll()} title="Collapse all clusters">collapse</button>
		<button onclick={() => viewer.setZoom(viewer.effectiveZoom / 1.4)} title="Zoom out">−</button>
		<span class="zoom">{viewer.effectiveZoom.toFixed(2)}×</span>
		<button onclick={() => viewer.setZoom(viewer.effectiveZoom * 1.4)} title="Zoom in">+</button>
		{#if focusActive}
			<button onclick={() => viewer.clearFocus()} title="Clear selection and highlights">clear</button>
		{/if}
	</fieldset>
	</div>
	{/if}

	<div class="status" class:flash>
		{#if g.data.problems.length}
			<button class="problems" onclick={() => (showProblems = !showProblems)}>
				⚠ {g.data.problems.length} problem{g.data.problems.length === 1 ? '' : 's'}
			</button>
		{:else}
			<span class="ok" title="Lenient load OK. Run `task data:build` for full schema validation.">data ok</span>
		{/if}
		<span class="loaded" title="Last loaded from data/">{new Date(g.data.loadedAt).toLocaleTimeString()}</span>
		<button
			class="toggle panel-toggle"
			class:on={viewer.panelOpen}
			onclick={() => (viewer.panelOpen = !viewer.panelOpen)}
			aria-expanded={viewer.panelOpen}
			title={viewer.panelOpen ? 'Fold the detail panel' : 'Open the detail panel'}
		>
			{viewer.panelOpen ? 'Hide details' : 'Details'}
		</button>
		<a class="repo" href="https://github.com/sunsided/history-of-languages" target="_blank" rel="noreferrer" title="Source and dataset on GitHub" aria-label="GitHub repository">
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
			<button class:active={activeEra === e.id} onclick={() => viewer.jump(e.id)} title="{e.name} ({e.start < 0 ? `${-e.start} BC` : e.start}–{e.end ?? 'now'}){e.summary ? '\n' + e.summary : ''}">
				<span class="era-year">{e.start < 0 ? `${-e.start} BC` : e.start}</span>
				<span class="era-name">{e.name}</span>
			</button>
		{/each}
		<button class="now" class:active={activeEra === 'now'} onclick={() => viewer.jump('now')} title="Scroll to the present">Now →</button>
	</nav>
</header>

{#if showProblems && g.data.problems.length}
	<div class="problem-list">
		<div class="pl-head">
			<span>Load problems (lenient loader; run <code>task data:build</code> for full schema validation)</span>
			<button onclick={() => (showProblems = false)}>close</button>
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
		gap: 6px 14px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--line);
		background: var(--bg-raised);
		font-size: 12px;
	}
	.filters {
		display: contents;
	}
	.toggle.on {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.eras {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		scrollbar-width: thin;
		padding-bottom: 2px;
	}
	.eras button {
		flex: none;
		display: inline-flex;
		align-items: baseline;
		gap: 5px;
		max-width: 220px;
		border-radius: 999px;
		padding: 2px 9px;
		white-space: nowrap;
	}
	.eras button.active {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.era-year {
		color: var(--fg-faint);
		font-variant-numeric: tabular-nums;
		font-size: 11px;
	}
	.era-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.eras .now {
		margin-left: auto;
		font-weight: 600;
	}
	.brand {
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.01em;
	}
	.search-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: 220px;
		color: var(--fg-faint);
		text-align: left;
	}
	.search-text {
		flex: 1;
	}
	.search-icon {
		font-size: 15px;
		line-height: 1;
	}
	kbd {
		font-family: var(--mono);
		font-size: 10px;
		padding: 0 4px;
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 3px;
		color: var(--fg-muted);
	}
	@media (max-width: 899px) {
		.toolbar {
			gap: 6px 8px;
			padding: 6px 10px;
		}
		.brand {
			display: none;
		}
		.search-btn {
			flex: 1;
			min-width: 0;
			width: auto;
		}
		.search-btn kbd {
			display: none;
		}
		.filters {
			display: flex;
			flex-direction: column;
			gap: 8px;
			flex-basis: 100%;
			order: 5;
			padding: 6px 0;
			border-top: 1px solid var(--line);
		}
		.group {
			flex-wrap: wrap;
		}
		.status {
			margin-left: 0;
			gap: 6px;
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
		.eras button:hover .era-name,
		.eras button.active .era-name {
			display: inline;
		}
	}
	select,
	button {
		font: inherit;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 5px;
		padding: 3px 7px;
	}
	button {
		cursor: pointer;
	}
	button:hover {
		background: var(--hover);
	}
	select {
		max-width: 180px;
	}
	.group {
		display: flex;
		align-items: center;
		gap: 4px;
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		float: left;
		padding: 0 4px 0 0;
		color: var(--fg-faint);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
		user-select: none;
	}
	.chip:has(input:not(:checked)) {
		opacity: 0.45;
	}
	.chip input {
		display: none;
	}
	.swatch {
		width: 14px;
		height: 3px;
		background: var(--sw, var(--fg-muted));
		border-radius: 2px;
	}
	.swatch.round {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.fam-succession {
		--sw: var(--fam-succession);
	}
	.fam-influence {
		--sw: var(--fam-influence);
	}
	.fam-variant {
		--sw: var(--fam-variant);
	}
	.fam-targets {
		--sw: var(--fam-targets);
	}
	.fam-implementation {
		--sw: var(--fam-implementation);
	}
	.kind-mechanism {
		--sw: var(--kind-mechanism);
	}
	.kind-machine {
		--sw: var(--kind-machine);
	}
	.kind-machine-code {
		--sw: var(--kind-machine-code);
	}
	.kind-formalism {
		--sw: var(--kind-formalism);
	}
	.kind-notation {
		--sw: var(--kind-notation);
	}
	.kind-assembly {
		--sw: var(--kind-assembly);
	}
	.kind-language {
		--sw: var(--kind-language);
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
		gap: 8px;
		padding: 2px 6px;
		border-radius: 5px;
		transition: background 0.6s;
	}
	.status.flash {
		background: var(--accent-soft);
		transition: none;
	}
	.problems {
		color: var(--warn);
		border-color: var(--warn);
	}
	.ok {
		color: var(--rs-reviewed);
	}
	.loaded {
		color: var(--fg-faint);
		font-variant-numeric: tabular-nums;
	}
	.repo {
		display: inline-flex;
		align-items: center;
		padding: 3px;
		border-radius: 5px;
		color: var(--fg-muted);
	}
	.repo:hover {
		color: var(--fg);
		background: var(--hover);
	}
	.repo:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.problem-list {
		position: absolute;
		z-index: 40;
		right: 12px;
		top: 46px;
		width: min(720px, calc(100vw - 24px));
		max-height: 60vh;
		overflow: auto;
		background: var(--bg-raised);
		border: 1px solid var(--warn);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
		font-size: 12px;
	}
	.pl-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		background: var(--bg-raised);
	}
	.problem-list ul {
		margin: 0;
		padding: 8px 10px 10px 28px;
		font-family: var(--mono);
		font-size: 11.5px;
	}
</style>
