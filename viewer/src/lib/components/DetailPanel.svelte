<script lang="ts">
	import { viewer } from '../viewer.svelte.ts';
	import {
		BACKWARD_LABEL,
		FAMILY_OF,
		FORWARD_LABEL,
		conceptArrival,
		cleanCommons,
		contemporaries,
		firstYear,
		mediaUrl,
		narrowerConcepts
	} from '../graph.ts';
	import type { Dating, Edge, MediaItem } from '../types.ts';

	const g = $derived(viewer.graph);
	const node = $derived(viewer.selected?.type === 'node' ? g.node.get(viewer.selected.id) : undefined);
	const cluster = $derived(viewer.selected?.type === 'cluster' ? g.clusters.get(viewer.selected.id) : undefined);
	const lineage = $derived(viewer.lineage ? g.data.lineages.find((l) => l.id === viewer.lineage) : undefined);
	const concept = $derived(viewer.concept ? g.concept.get(viewer.concept) : undefined);

	const conceptNodes = $derived.by(() => {
		if (!viewer.concept) return [];
		const ids = narrowerConcepts(g, viewer.concept);
		const out: { id: string; name: string; year: number; version?: string; via: string }[] = [];
		for (const n of g.data.nodes) {
			let best: { year: number; version?: string; via: string } | undefined;
			for (const c of ids) {
				const a = conceptArrival(n, c);
				if (a && (!best || a.year < best.year)) best = { ...a, via: c };
			}
			if (best) out.push({ id: n.id, name: n.name, ...best });
		}
		return out.sort((a, b) => a.year - b.year);
	});

	const images = $derived(node ? (g.nodeMedia.get(node.id) ?? []) : []);
	const portraits = $derived(
		node ? (node.creators ?? []).map((c) => g.personMedia.get(c.name)).filter((m): m is MediaItem => !!m) : []
	);

	const claims = $derived(node ? g.data.claims.filter((c) => c.nodes?.includes(node.id)) : []);
	const rivals = $derived(node ? contemporaries(g, node.id) : []);

	function dating(d?: Dating) {
		if (!d) return '';
		const y = d.year < 0 ? `${-d.year} BC` : String(d.year);
		const range = d.year_end ? `${y}–${d.year_end}` : y;
		return [d.date ?? range, d.precision && d.precision !== 'year' && d.precision !== 'exact' ? `(${d.precision})` : '']
			.filter(Boolean)
			.join(' ');
	}

	function name(id: string) {
		return g.node.get(id)?.name ?? id;
	}
	function conceptName(id: string) {
		return g.concept.get(id)?.name ?? id;
	}

	function groupEdges(edges: Edge[], dir: 'out' | 'in') {
		const groups = new Map<string, Edge[]>();
		for (const e of edges) {
			const label = dir === 'out' ? BACKWARD_LABEL[e.type] : FORWARD_LABEL[e.type];
			(groups.get(label) ?? groups.set(label, []).get(label)!).push(e);
		}
		return [...groups.entries()];
	}
</script>

{#snippet attribution(m: MediaItem)}
	<span class="credit">
		{cleanCommons(m.credit)} ·
		{#if m.license_url}<a href={m.license_url} target="_blank" rel="noreferrer">{m.license}</a>{:else}{m.license}{/if}
		· <a href={m.source_url} target="_blank" rel="noreferrer">source</a>
	</span>
{/snippet}

{#snippet nodeLink(id: string)}
	<button class="link" onclick={() => viewer.selectNode(id)}>{name(id)}</button>
{/snippet}

{#snippet conceptChip(id: string)}
	<button class="tag" class:active={viewer.concept === id} onclick={() => viewer.setConcept(viewer.concept === id ? null : id)} title={g.concept.get(id)?.summary ?? id}>
		{conceptName(id)}
	</button>
{/snippet}

{#snippet sourceList(ids: string[] | undefined)}
	{#if ids?.length}
		<ul class="sources">
			{#each ids as sid (sid)}
				{@const s = g.source.get(sid)}
				<li>
					{#if s}
						{#if s.checked}<span class="checked" title="checked {s.checked}">✓</span>{/if}
						{s.authors?.join(', ')}{s.year ? ` (${s.year})` : ''}.
						{#if s.url}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{:else}<em>{s.title}</em>{/if}
						{#if s.primary}<span class="badge">primary</span>{/if}
					{:else}
						<span class="missing">{sid} (unknown source)</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet edgeGroups(edges: Edge[], dir: 'out' | 'in')}
	{#each groupEdges(edges, dir) as [label, list] (label)}
		<div class="edge-group">
			<div class="edge-label fam-{FAMILY_OF[list[0].type]}"><span class="swatch"></span>{label}</div>
			<ul>
				{#each list as e, i (i)}
					{@const other = dir === 'out' ? e.to : e.from}
					<li>
						{@render nodeLink(other)}
						<span class="muted">
							{firstYear(g.node.get(other)!)}{e.year ? ` · in ${e.year}` : ''}{e.weight ? ` · ${e.weight}` : ''}{e.confidence ? ` · ${e.confidence} conf.` : ''}
						</span>
						{#if e.aspects?.length}
							<div class="tags small">{#each e.aspects as a (a)}{@render conceptChip(a)}{/each}</div>
						{/if}
						{#if e.note}<div class="note">{e.note}</div>{/if}
						{#if e.sources?.length}{@render sourceList(e.sources)}{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}
{/snippet}

<aside class="panel">
	{#if node}
		<header>
			<div class="kicker">
				<span class="kind-dot kind-{node.kind}"></span>{node.kind}{node.category ? ` · ${node.category}` : ''}{node.status ? ` · ${node.status}` : ''}
			</div>
			<h2>{node.name}</h2>
			{#if node.aliases?.length}<div class="muted">{node.aliases.join(' · ')}</div>{/if}
			<button class="deselect" onclick={() => viewer.deselect()} title="Clear the selection (Esc, or click it again)">Deselect</button>
			<button class="close" onclick={() => (viewer.panelOpen = false)} title="Fold panel">×</button>
		</header>

		{#each images as m (m.id)}
			<figure class="hero">
				<a href={m.source_url} target="_blank" rel="noreferrer" title="Open on Wikimedia Commons">
					<img src={mediaUrl(m)} alt={cleanCommons(m.caption)} loading="lazy" />
				</a>
				<figcaption>
					<span class="caption" title={cleanCommons(m.caption)}>{cleanCommons(m.caption)}</span>
					{@render attribution(m)}
				</figcaption>
			</figure>
		{/each}

		<dl class="facts">
			{#if node.origin.began}<dt>began</dt><dd>{dating(node.origin.began)}{#if node.origin.began.note}<div class="note">{node.origin.began.note}</div>{/if}</dd>{/if}
			<dt>appeared</dt>
			<dd>{dating(node.origin.first_appeared)}{#if node.origin.first_appeared.note}<div class="note">{node.origin.first_appeared.note}</div>{/if}</dd>
			{#if node.creators?.length}
				<dt>creators</dt>
				<dd>
					{#each node.creators as c, i (i)}
						{@const photo = g.personMedia.get(c.name)}
						<div class="creator">
							{#if photo}
								<img class="avatar" src={mediaUrl(photo)} alt={c.name} loading="lazy" title="{c.name} · {cleanCommons(photo.credit)} · {photo.license}" />
							{/if}
							<span>{c.name}{c.role ? ` (${c.role})` : ''}{c.affiliation ? `, ${c.affiliation}` : ''}</span>
						</div>
					{/each}
				</dd>
			{/if}
			{#if node.origin.places?.length}
				<dt>where</dt>
				<dd>{node.origin.places.map((p) => [p.institution, p.city, p.country].filter(Boolean).join(', ')).join('; ')}</dd>
			{/if}
			<dt>cluster</dt>
			<dd><button class="link" onclick={() => viewer.selectCluster(node.cluster)}>{node.cluster}</button></dd>
			<dt>research</dt>
			<dd><span class="rs rs-{node.research_status}">{node.research_status}</span>{node.confidence ? ` · ${node.confidence} confidence` : ''} <span class="muted">· {node._file}</span></dd>
		</dl>

		<p class="summary">{node.summary}</p>
		{#if node.notes}<p class="note">{node.notes}</p>{/if}
		{#if node.links}
			<p class="links">
				{#if node.links.wikipedia}<a href={node.links.wikipedia} target="_blank" rel="noreferrer">Wikipedia</a>{/if}
				{#if node.links.homepage}<a href={node.links.homepage} target="_blank" rel="noreferrer">Homepage</a>{/if}
			</p>
		{/if}

		{#if node.example}
			{@const ex = node.example}
			<h3>Example <span class="muted">{ex.language ?? ''}{ex.year ? ` (${ex.year})` : ''}</span></h3>
			{#if ex.title}<div class="ex-title">{ex.title}</div>{/if}
			<pre class="code">{ex.code.trimEnd()}</pre>
			{#if ex.note}<p class="note">{ex.note}</p>{/if}
			{@render sourceList(ex.sources)}
		{/if}

		{#if node.tags && Object.keys(node.tags).length}
			<h3>Tags</h3>
			{#each Object.entries(node.tags) as [facet, vals] (facet)}
				<div class="facet"><span class="facet-name">{facet}</span><div class="tags">{#each vals as v (v)}{@render conceptChip(v)}{/each}</div></div>
			{/each}
		{/if}

		{#if node.milestones?.length}
			<h3>Milestones</h3>
			<ol class="milestones">
				{#each node.milestones as m (m.version + m.year)}
					<li>
						<span class="ms-year">{m.year}</span>
						<div>
							<strong>{m.version}</strong>
							{#if m.summary}<span class="muted"> — {m.summary}</span>{/if}
							{#if m.introduces?.length}<div class="tags small">{#each m.introduces as c (c)}{@render conceptChip(c)}{/each}</div>{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}

		{#if g.outgoing.get(node.id)?.length}
			<h3>Ancestry <span class="muted">(stored)</span></h3>
			{@render edgeGroups(g.outgoing.get(node.id) ?? [], 'out')}
		{/if}
		{#if g.incoming.get(node.id)?.length}
			<h3>Descendants <span class="muted">(derived)</span></h3>
			{@render edgeGroups(g.incoming.get(node.id) ?? [], 'in')}
		{/if}

		{#if rivals.length}
			<h3>Contemporaries <span class="muted">(same kind & category, ±5 y, unlinked)</span></h3>
			<div class="tags">
				{#each rivals as r (r.id)}<button class="tag" onclick={() => viewer.selectNode(r.id)}>{r.name} <span class="muted">{firstYear(r)}</span></button>{/each}
			</div>
		{/if}

		{#if claims.length}
			<h3>Claims</h3>
			{#each claims as c (c.id)}
				<div class="claim">
					<div><span class="verdict verdict-{c.verdict}">{c.verdict}</span> {c.claim}</div>
					{#if c.summary}<p class="note">{c.summary}</p>{/if}
				</div>
			{/each}
		{/if}

		{#if node.sources?.length}
			<h3>Sources</h3>
			{@render sourceList(node.sources)}
		{/if}

		{#if portraits.length}
			<h3>Image credits</h3>
			<ul class="sources">
				{#each portraits as m (m.id)}
					<li>{m.person}: {@render attribution(m)}</li>
				{/each}
			</ul>
		{/if}
	{:else if cluster}
		{@const c = cluster.cluster}
		<header>
			<div class="kicker">cluster · {c.id}</div>
			<h2>{c.name}</h2>
			<button class="close" onclick={() => (viewer.panelOpen = false)} title="Fold panel">×</button>
		</header>
		{#if c._synthetic}<p class="warn">Not defined in clusters.yaml; referenced only.</p>{/if}
		<dl class="facts">
			<dt>research</dt>
			<dd><span class="rs rs-{c.research_status ?? 'none'}">{c.research_status ?? 'unset'}</span></dd>
			<dt>span</dt>
			<dd>{isFinite(cluster.start) ? `${cluster.start}–${cluster.end}` : '—'}</dd>
			<dt>members</dt>
			<dd>{cluster.allNodes.length} ({cluster.nodes.length} direct)</dd>
			{#if c.parent}<dt>parent</dt><dd><button class="link" onclick={() => viewer.selectCluster(c.parent!)}>{c.parent}</button></dd>{/if}
		</dl>
		{#if c.summary}<p class="summary">{c.summary}</p>{/if}
		{#if cluster.children.length}
			<h3>Sub-clusters</h3>
			<div class="tags">
				{#each cluster.children as ch (ch)}
					<button class="tag" onclick={() => viewer.selectCluster(ch)}>{g.clusters.get(ch)?.cluster.name}</button>
				{/each}
			</div>
		{/if}
		{#if cluster.nodes.length}
			<h3>Members</h3>
			<ul class="plain">
				{#each cluster.nodes as id (id)}<li>{@render nodeLink(id)} <span class="muted">{firstYear(g.node.get(id)!)} · {g.node.get(id)!.research_status}</span></li>{/each}
			</ul>
		{/if}
		{#if c.backlog?.length}
			<h3>Backlog <span class="muted">({c.backlog.length})</span></h3>
			<ul class="plain">
				{#each c.backlog as b, i (i)}
					<li><span class="ms-year">{b.year ?? '?'}</span> {b.name}{#if b.hint}<div class="note">{b.hint}</div>{/if}</li>
				{/each}
			</ul>
		{/if}
		{#if c.research_questions?.length}
			<h3>Research questions</h3>
			<ul>{#each c.research_questions as q, i (i)}<li class="note">{q}</li>{/each}</ul>
		{/if}
		{#if c.key_sources?.length}
			<h3>Key sources</h3>
			{@render sourceList(c.key_sources)}
		{/if}
	{:else if lineage}
		<header>
			<div class="kicker">lineage · {lineage.research_status ?? ''}</div>
			<h2>{lineage.title}</h2>
			<button class="close" onclick={() => (viewer.panelOpen = false)} title="Fold panel">×</button>
		</header>
		{#if lineage.thesis}<p class="summary">{lineage.thesis}</p>{/if}
		{#if lineage.concepts?.length}<div class="tags">{#each lineage.concepts as c (c)}{@render conceptChip(c)}{/each}</div>{/if}
		<ol class="steps">
			{#each lineage.steps as s, i (i)}
				<li>
					<button
						class="step"
						class:active={s.nodes?.length && viewer.stepNodes.join() === s.nodes.join()}
						onclick={() => {
							viewer.stepNodes = s.nodes ?? [];
							if (s.nodes?.[0]) viewer.reveal(s.nodes[0]);
						}}
					>
						<span class="ms-year">{s.year}</span>
						<strong>{s.title}</strong>
					</button>
					{#if s.text}<p class="note">{s.text}</p>{/if}
					<div class="tags small">
						{#each s.nodes ?? [] as n (n)}{@render nodeLink(n)}{/each}
						{#each s.systems ?? [] as sys (sys)}<span class="tag system">{sys}</span>{/each}
					</div>
				</li>
			{/each}
		</ol>
	{:else if concept}
		<header>
			<div class="kicker">concept · {concept.facet ?? ''}</div>
			<h2>{concept.name}</h2>
			<button class="close" onclick={() => (viewer.panelOpen = false)} title="Fold panel">×</button>
		</header>
		{#if concept.summary}<p class="summary">{concept.summary}</p>{:else}<p class="warn">No summary yet.</p>{/if}
		{#if concept.broader?.length}<div class="facet"><span class="facet-name">broader</span><div class="tags">{#each concept.broader as b (b)}{@render conceptChip(b)}{/each}</div></div>{/if}
		{#if concept.first_seen?.node}
			<p>First seen: {@render nodeLink(concept.first_seen.node)} {concept.first_seen.year ?? ''} {#if concept.first_seen.note}<span class="note">{concept.first_seen.note}</span>{/if}</p>
		{/if}
		<h3>Arrival <span class="muted">(incl. narrower concepts)</span></h3>
		<ol class="milestones">
			{#each conceptNodes as c (c.id)}
				<li>
					<span class="ms-year">{c.year}</span>
					<div>{@render nodeLink(c.id)}{#if c.version}<span class="muted"> {c.version}</span>{/if}{#if c.via !== viewer.concept}<span class="muted"> via {conceptName(c.via)}</span>{/if}</div>
				</li>
			{/each}
		</ol>
	{:else}
		<div class="empty">
			<header>
				<h2>Timeline</h2>
				<button class="close" onclick={() => (viewer.panelOpen = false)} title="Fold panel">×</button>
			</header>
			<p>Click a language to see its ancestry and descendants; click it again, click empty space or press Esc to deselect. Click a cluster row to unfold it; its ⓘ opens the cluster's research notes.</p>
			<ul>
				<li><b>Dot</b>: first appearance. Hollow = stub, ringed = reviewed.</li>
				<li><b>Faint bar</b> before it: design period (<code>origin.began</code>).</li>
				<li><b>Line</b> after it: alive to now (active / maintained), else to the last milestone. Ticks are milestones.</li>
				<li><b>Arrows</b> run forward in time, older → newer. Dashed = low confidence. Thickness = weight.</li>
				<li><b>Dashed circles</b> on cluster rows: backlog items not yet researched.</li>
				<li>Pick a <b>concept</b> to see when each language acquired it (◆), or a <b>lineage</b> to walk its story.</li>
			</ul>
			<p class="muted">Edits under <code>data/</code> appear here live.</p>
		</div>
	{/if}
</aside>

<style>
	.panel {
		height: 100%;
		overflow: auto;
		padding: 14px 16px 40px;
		border-left: 1px solid var(--line);
		background: var(--bg-raised);
		font-size: 13px;
		line-height: 1.45;
	}
	header {
		position: relative;
		margin-bottom: 10px;
	}
	h2 {
		margin: 2px 0;
		font-size: 20px;
		letter-spacing: -0.01em;
	}
	h3 {
		margin: 18px 0 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
	}
	h3 .muted {
		text-transform: none;
		letter-spacing: 0;
	}
	.kicker {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--fg-muted);
		font-size: 11.5px;
	}
	.deselect {
		margin-top: 6px;
		font: inherit;
		font-size: 11.5px;
		padding: 2px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg);
		color: var(--fg);
		cursor: pointer;
	}
	.deselect:hover {
		background: var(--hover);
	}
	.close {
		position: absolute;
		top: -4px;
		right: -6px;
		border: none;
		background: none;
		font-size: 20px;
		color: var(--fg-muted);
		cursor: pointer;
	}
	.muted {
		color: var(--fg-faint);
	}
	.note {
		color: var(--fg-muted);
		font-size: 12px;
		margin: 2px 0;
	}
	.warn {
		color: var(--warn);
	}
	.summary {
		margin: 10px 0;
	}
	.hero {
		margin: 4px 0 12px;
	}
	.hero img {
		display: block;
		width: 100%;
		max-height: 240px;
		object-fit: contain;
		background: var(--code-bg);
		border-radius: 6px;
	}
	.hero figcaption {
		margin-top: 4px;
		font-size: 11px;
		color: var(--fg-muted);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.caption {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.credit {
		color: var(--fg-faint);
		font-size: 10.5px;
	}
	.creator {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 22px;
	}
	.avatar {
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: 50%;
		object-fit: cover;
		object-position: 50% 25%;
		background: var(--code-bg);
	}
	.ex-title {
		font-weight: 600;
		margin-bottom: 4px;
	}
	.code {
		margin: 4px 0 6px;
		padding: 10px 12px;
		background: var(--code-bg);
		border-radius: 6px;
		font-family: var(--mono);
		font-size: 12px;
		line-height: 1.45;
		overflow-x: auto;
		white-space: pre;
	}
	.facts {
		display: grid;
		grid-template-columns: 74px 1fr;
		gap: 3px 10px;
		margin: 0;
	}
	dt {
		color: var(--fg-faint);
		font-size: 11.5px;
		padding-top: 1px;
	}
	dd {
		margin: 0;
	}
	.links {
		display: flex;
		gap: 12px;
	}
	a {
		color: var(--accent);
	}
	.link {
		all: unset;
		color: var(--accent);
		cursor: pointer;
	}
	.link:hover {
		text-decoration: underline;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 3px 0;
	}
	.tags.small {
		gap: 3px 6px;
	}
	.tag {
		font: inherit;
		font-size: 11.5px;
		padding: 1px 7px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--fg);
		cursor: pointer;
	}
	.tags.small .tag {
		font-size: 10.5px;
		padding: 0 6px;
	}
	.tag.active {
		background: var(--warn);
		border-color: var(--warn);
		color: var(--bg);
	}
	.tag.system {
		cursor: default;
		border-style: dashed;
		color: var(--fg-muted);
	}
	.facet {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.facet-name {
		width: 74px;
		flex: none;
		color: var(--fg-faint);
		font-size: 11.5px;
	}
	.milestones,
	.steps,
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.milestones li {
		display: flex;
		gap: 8px;
		padding: 3px 0;
	}
	.plain li {
		padding: 2px 0;
	}
	.ms-year {
		display: inline-block;
		min-width: 38px;
		color: var(--fg-faint);
		font-variant-numeric: tabular-nums;
	}
	.steps li {
		padding: 6px 0;
		border-bottom: 1px solid var(--line);
	}
	.step {
		all: unset;
		cursor: pointer;
		display: block;
	}
	.step.active strong,
	.step:hover strong {
		color: var(--warn);
	}
	.edge-group {
		margin-bottom: 8px;
	}
	.edge-group ul {
		margin: 2px 0 0;
		padding-left: 18px;
	}
	.edge-group li {
		margin: 3px 0;
	}
	.edge-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		font-size: 12px;
	}
	.swatch {
		width: 14px;
		height: 3px;
		border-radius: 2px;
		background: var(--sw);
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
	.sources {
		margin: 3px 0;
		padding-left: 16px;
		font-size: 11.5px;
		color: var(--fg-muted);
	}
	.checked {
		color: var(--rs-reviewed);
		font-weight: 700;
	}
	.badge {
		font-size: 10px;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0 3px;
		margin-left: 3px;
	}
	.missing {
		color: var(--warn);
	}
	.rs {
		font-weight: 600;
	}
	.rs-stub {
		color: var(--fg-faint);
	}
	.rs-draft {
		color: var(--rs-draft);
	}
	.rs-reviewed {
		color: var(--rs-reviewed);
	}
	.claim {
		margin: 6px 0;
	}
	.verdict {
		font-size: 10.5px;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0 4px;
		border-radius: 3px;
		background: var(--hover);
	}
	.verdict-false {
		color: var(--warn);
	}
	.verdict-true {
		color: var(--rs-reviewed);
	}
	.kind-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--k);
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
	.empty ul {
		padding-left: 18px;
	}
	.empty li {
		margin: 4px 0;
	}
	code {
		font-family: var(--mono);
		font-size: 11.5px;
	}
</style>
