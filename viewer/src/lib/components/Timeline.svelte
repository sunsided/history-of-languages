<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { viewer } from '../viewer.svelte.ts';
	import { timeScale, NOW, PAD } from '../scale.ts';
	import { layout, type Row } from '../layout.ts';
	import {
		FAMILY_OF,
		FORWARD_LABEL,
		conceptArrival,
		branchYear,
		endYear,
		firstYear,
		narrowerConcepts,
		reach,
		type EdgeFamily
	} from '../graph.ts';
	import type { Edge, LangNode } from '../types.ts';

	const AXIS_H = 46;
	const INDENT = 14;

	let scroller: HTMLDivElement | undefined = $state();
	let pointer = $state({ x: 0, y: 0, mouse: true });
	let winW = $state(1200);
	let winH = $state(800);

	const g = $derived(viewer.graph);
	// Responsive: narrower label gutter on small screens, taller rows for touch.
	const GUTTER = $derived(viewer.narrow.current ? 136 : 260);
	const ROW_H = $derived(viewer.coarse.current ? 30 : 24);
	const INDENT_PX = $derived(viewer.narrow.current ? 9 : INDENT);
	const scale = $derived(timeScale(viewer.effectiveZoom));

	// Fit-to-width floor for zoom: the axis always spans the whole viewport.
	let viewW = $state(0);
	const baseWidth = timeScale(1).width - 2 * PAD;
	$effect(() => {
		if (viewW > 0) viewer.minZoom = Math.max(0.05, (viewW - GUTTER - 2 * PAD) / baseWidth);
	});
	const lay = $derived(layout(g, viewer.expanded, viewer.hiddenKinds, ROW_H));
	const ticks = $derived(scale.ticks());

	// ---- focus sets ----
	const selNode = $derived(viewer.selected?.type === 'node' ? viewer.selected.id : null);
	const maxDepth = $derived(viewer.depth === 'direct' ? 1 : Infinity);
	const ancestors = $derived(selNode ? reach(g, selNode, 'up', viewer.families, maxDepth) : new Map<string, number>());
	const descendants = $derived(selNode ? reach(g, selNode, 'down', viewer.families, maxDepth) : new Map<string, number>());

	const conceptSet = $derived(viewer.concept ? narrowerConcepts(g, viewer.concept) : null);
	const arrivals = $derived.by(() => {
		const out = new Map<string, { year: number; version?: string }>();
		if (!conceptSet) return out;
		for (const n of g.data.nodes) {
			let best: { year: number; version?: string } | undefined;
			for (const c of conceptSet) {
				const a = conceptArrival(n, c);
				if (a && (!best || a.year < best.year)) best = a;
			}
			if (best) out.set(n.id, best);
		}
		return out;
	});

	const lineageNodes = $derived.by(() => {
		const l = g.data.lineages.find((x) => x.id === viewer.lineage);
		return new Set(l?.steps.flatMap((s) => s.nodes ?? []) ?? []);
	});
	const stepSet = $derived(new Set(viewer.stepNodes));

	const filtering = $derived(selNode !== null || conceptSet !== null || lineageNodes.size > 0);
	function lit(id: string): boolean {
		if (!filtering) return true;
		if (selNode && (id === selNode || ancestors.has(id) || descendants.has(id))) return true;
		if (conceptSet && arrivals.has(id)) return true;
		if (lineageNodes.has(id)) return true;
		return false;
	}

	// ---- edges ----
	interface VisEdge {
		key: string;
		edge: Edge;
		family: EdgeFamily;
		count: number;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		on: boolean;
		hot: boolean;
	}

	const hoverId = $derived(viewer.hover?.type === 'node' ? viewer.hover.id : null);

	function edgeOn(e: Edge): boolean {
		if (selNode) {
			const down = (e.to === selNode || descendants.has(e.to)) && descendants.has(e.from);
			const up = (e.from === selNode || ancestors.has(e.from)) && ancestors.has(e.to);
			return down || up;
		}
		if (lineageNodes.size) return lineageNodes.has(e.from) && lineageNodes.has(e.to);
		if (conceptSet) return arrivals.has(e.from) && arrivals.has(e.to);
		return true;
	}

	const edges = $derived.by(() => {
		const byKey = new Map<string, VisEdge>();
		for (const e of g.data.edges) {
			const family = FAMILY_OF[e.type];
			if (!viewer.families.has(family)) continue;
			const a = lay.anchor.get(e.to);
			const b = lay.anchor.get(e.from);
			if (!a || !b) continue;
			if (a.row === b.row && !a.own) continue; // both folded into the same cluster row
			const older = g.node.get(e.to)!;
			const newer = g.node.get(e.from)!;
			const x1 = scale.x(branchYear(e, older, newer));
			const x2 = scale.x(Math.max(e.year ?? firstYear(newer), firstYear(newer)));
			const key = `${family}|${a.row}:${a.own ? e.to : Math.round(x1)}|${b.row}:${b.own ? e.from : Math.round(x2)}`;
			const prev = byKey.get(key);
			const on = edgeOn(e);
			const hot = hoverId !== null && (e.from === hoverId || e.to === hoverId);
			if (prev) {
				prev.count++;
				prev.on ||= on;
				prev.hot ||= hot;
				continue;
			}
			byKey.set(key, { key, edge: e, family, count: 1, x1, y1: a.y, x2, y2: b.y, on, hot });
		}
		// draw dimmed first, highlighted last
		return [...byKey.values()].sort((p, q) => Number(p.on) - Number(q.on) || Number(p.hot) - Number(q.hot));
	});

	function edgePath(e: VisEdge): string {
		const { x1, y1, x2, y2 } = e;
		if (Math.abs(x2 - x1) < 12) {
			const bulge = 18 + Math.min(60, Math.abs(y2 - y1) / 6);
			return `M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`;
		}
		const dx = Math.max(16, (x2 - x1) / 2);
		return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
	}

	const WIDTH = { strong: 2.2, moderate: 1.4, weak: 0.9 } as const;

	// ---- collapsed-row labels: greedy, skip ones that would overlap ----
	function clusterLabels(row: Extract<Row, { type: 'cluster' }>) {
		const items = row.members
			.map((id) => g.node.get(id)!)
			.sort((a, b) => firstYear(a) - firstYear(b));
		let lastEnd = -Infinity;
		return items.map((n) => {
			const x = scale.x(firstYear(n));
			const w = n.name.length * 6.2 + 10;
			const show = x + 6 > lastEnd;
			if (show) lastEnd = x + 6 + w;
			return { n, x, show };
		});
	}

	function labelLeft(n: LangNode): boolean {
		return scale.x(n.origin.began?.year ?? firstYear(n)) > n.name.length * 6.6 + 16;
	}

	// ---- interactions ----
	/** Zoom the time axis, keeping the year under clientX in place. */
	function zoomAt(clientX: number, next: number) {
		if (!scroller) return;
		const rect = scroller.getBoundingClientRect();
		const px = clientX - rect.left - GUTTER + scroller.scrollLeft;
		const yearAt = scale.year(px);
		viewer.setZoom(next);
		scroller.scrollLeft += timeScale(viewer.effectiveZoom).x(yearAt) - px;
	}

	function onWheel(ev: WheelEvent) {
		unpinEra();
		if (!(ev.ctrlKey || ev.metaKey)) return;
		ev.preventDefault();
		zoomAt(ev.clientX, viewer.effectiveZoom * Math.exp(-ev.deltaY * 0.0015));
	}

	// Two-finger pinch zooms the time axis; one finger scrolls natively.
	let pinch: { dist: number; zoom: number } | null = null;
	const spread = (t: TouchList) => Math.abs(t[0].clientX - t[1].clientX) + Math.abs(t[0].clientY - t[1].clientY);
	function onTouchStart(ev: TouchEvent) {
		if (ev.touches.length === 2) pinch = { dist: spread(ev.touches), zoom: viewer.effectiveZoom };
	}
	function onTouchMove(ev: TouchEvent) {
		if (!pinch || ev.touches.length !== 2) return;
		ev.preventDefault();
		const cx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
		zoomAt(cx, pinch.zoom * (spread(ev.touches) / Math.max(1, pinch.dist)));
	}
	function onTouchEnd(ev: TouchEvent) {
		if (ev.touches.length < 2) pinch = null;
	}
	// Attached manually: Svelte registers touchmove as passive, which would ignore preventDefault().
	function pinchZoom(el: HTMLElement) {
		el.addEventListener('touchstart', onTouchStart, { passive: true });
		el.addEventListener('touchmove', onTouchMove, { passive: false });
		el.addEventListener('touchend', onTouchEnd);
		el.addEventListener('touchcancel', onTouchEnd);
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('touchend', onTouchEnd);
			el.removeEventListener('touchcancel', onTouchEnd);
		};
	}

	/** clicking empty timeline space (not a node, edge or cluster bar) clears the node selection */
	function onBackgroundClick(ev: MouseEvent) {
		const t = ev.target as Element;
		if (t === ev.currentTarget || t.matches('.era-band, .grid-line, .now-line, .row-bg')) viewer.deselect();
	}

	function onPointerMove(ev: PointerEvent) {
		pointer = { x: ev.clientX, y: ev.clientY, mouse: ev.pointerType !== 'touch' };
	}

	// Start at the present (as if "Now" was clicked): the left end is sparse antiquity, the right end is
	// where most languages live.
	let initialScrollDone = false;
	$effect(() => {
		if (!scroller || initialScrollDone) return;
		initialScrollDone = true;
		const el = scroller;
		untrack(() => (viewer.pinnedEra = 'now'));
		tick().then(() => (el.scrollLeft = el.scrollWidth));
	});

	$effect(() => {
		const t = viewer.scrollTarget;
		if (!t || !scroller) return;
		const el = scroller;
		tick().then(() => {
			let x: number, y: number;
			if (t.type === 'cluster') {
				const row = lay.rows.find((r) => r.type === 'cluster' && r.id === t.id);
				const info = g.clusters.get(t.id);
				if (!row || !info) return;
				x = isFinite(info.start) ? scale.x(info.start) + (el.clientWidth - GUTTER) / 3 : el.scrollLeft + (el.clientWidth - GUTTER) / 2;
				y = row.y + el.clientHeight / 3; // put the header in the upper third so its members show below
			} else {
				const a = lay.anchor.get(t.id);
				const n = g.node.get(t.id);
				if (!a || !n) return;
				x = scale.x(firstYear(n));
				y = a.y;
			}
			el.scrollTo({
				left: Math.max(0, x - (el.clientWidth - GUTTER) / 2),
				top: Math.max(0, y - el.clientHeight / 2),
				behavior: 'smooth'
			});
		});
	});

	// Era navigation: centre the era's middle; 'now' scrolls to the right edge.
	// Late eras sit inside the last viewport-width, where centring would need scrolling past the end
	// (the browser clamps, so 1990/2000/2010 all landed in the same spot). For those, zoom in just
	// enough that the era's middle can reach the centre.
	$effect(() => {
		const t = viewer.jumpTarget;
		if (!t || !scroller) return;
		const el = scroller;
		const view = el.clientWidth - untrack(() => GUTTER);
		if (t.era === 'now') {
			el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
			return;
		}
		const era = untrack(() => g.data.eras.find((e) => e.id === t.era));
		if (!era) return;
		const s1 = timeScale(1);
		const mid1 = (s1.x(era.start) + s1.x((era.end ?? NOW) + 1)) / 2; // pixel midpoint at zoom 1
		const tail1 = s1.width - PAD - mid1; // zoom-scaled distance from midpoint to the right end
		const needed = tail1 > 0 ? (view / 2 - PAD) / tail1 : 1;
		const current = untrack(() => viewer.effectiveZoom);
		if (needed > current) untrack(() => viewer.setZoom(needed * 1.02));
		tick().then(() => {
			const sc = timeScale(viewer.effectiveZoom);
			const mid = (sc.x(era.start) + sc.x((era.end ?? NOW) + 1)) / 2;
			el.scrollTo({ left: Math.max(0, mid - view / 2), behavior: 'smooth' });
		});
	});

	/** user-initiated scrolling (not our smooth scrollTo) releases the pinned era highlight */
	function unpinEra() {
		viewer.pinnedEra = null;
	}

	function onScroll() {
		if (!scroller) return;
		viewer.centerYear = scale.year(scroller.scrollLeft + (scroller.clientWidth - GUTTER) / 2);
	}

	const tooltip = $derived.by(() => {
		const h = viewer.hover;
		if (!h) return null;
		if (h.type === 'node') {
			const n = g.node.get(h.id);
			if (!n) return null;
			const began = n.origin.began ? `${n.origin.began.year}–` : '';
			return {
				title: n.name,
				sub: `${began}${firstYear(n)} · ${n.kind}${n.category ? ' · ' + n.category : ''}`,
				// with a code sample the sample is the point; keep the summary short
				body: n.example ? '' : n.summary,
				example: n.example
			};
		}
		const e = g.data.edges[h.idx];
		if (!e) return null;
		const from = g.node.get(e.to)?.name ?? e.to;
		const to = g.node.get(e.from)?.name ?? e.from;
		const aspects = e.aspects?.length ? `aspects: ${e.aspects.join(', ')}` : '';
		const meta = [e.weight, e.confidence && `${e.confidence} confidence`, e.from_version && `from ${e.from_version}`, e.year && `in ${e.year}`].filter(Boolean).join(' · ');
		return { example: undefined, title: `${from} → ${to}`, sub: `${FORWARD_LABEL[e.type]}${meta ? ' · ' + meta : ''}`, body: [aspects, e.note].filter(Boolean).join('\n') };
	});

	/** Truncate text to fit a pixel width (rough 6px/char estimate). */
	function fit(text: string, px: number): string {
		const max = Math.floor(px / 6);
		if (max < 4) return '';
		return text.length <= max ? text : text.slice(0, max - 1) + '…';
	}

	function edgeIndex(e: Edge) {
		return g.data.edges.indexOf(e);
	}

	const eras = $derived(
		[...g.data.eras].sort((a, b) => a.start - b.start).map((e, i) => ({
			...e,
			x1: scale.x(e.start),
			x2: scale.x((e.end ?? NOW) + 1),
			i
		}))
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="scroller"
	bind:this={scroller}
	bind:clientWidth={viewW}
	onwheel={onWheel}
	onscroll={onScroll}
	onpointerdown={unpinEra}
	onkeydown={unpinEra}
	ontouchstart={unpinEra}
	onpointermove={onPointerMove}
	{@attach pinchZoom}
>
	<div
		class="grid"
		style:width="{GUTTER + scale.width}px"
		style:grid-template-columns="{GUTTER}px {scale.width}px"
		style:grid-template-rows="{AXIS_H}px {lay.height + ROW_H}px"
	>
		<div class="corner">
			<span>{g.data.nodes.length} nodes · {g.data.edges.length} edges</span>
			<span class="hint">{viewer.coarse.current ? 'pinch to zoom' : 'ctrl+wheel zooms'}</span>
		</div>

		<svg class="axis" width={scale.width} height={AXIS_H}>
			{#each eras as era (era.id)}
				<rect x={era.x1} y="0" width={Math.max(0, era.x2 - era.x1)} height="18" class="era era-{era.i % 2}">
					<title>{era.name} ({era.start}–{era.end ?? 'now'}){era.summary ? '\n' + era.summary : ''}</title>
				</rect>
				{@const label = fit(era.name, era.x2 - era.x1 - 8)}
				{#if label}<text x={era.x1 + 4} y="13" class="era-label">{label}</text>{/if}
			{/each}
			{#each ticks as t (t.year)}
				<line x1={scale.x(t.year)} x2={scale.x(t.year)} y1={t.major ? 26 : 34} y2={AXIS_H} class="tick" />
				<text x={scale.x(t.year)} y="32" class="tick-label" class:major={t.major}>{t.year < 0 ? `${-t.year} BC` : t.year}</text>
			{/each}
		</svg>

		<div class="gutter">
			{#each lay.rows as row (row.type + row.id)}
				{#if row.type === 'cluster'}
					<button
						class="g-row g-cluster"
						style:height="{ROW_H}px"
						class:selected={viewer.selected?.type === 'cluster' && viewer.selected.id === row.id}
						class:synthetic={row.info.cluster._synthetic}
						style:top="{row.y}px"
						style:padding-left="{6 + row.depth * INDENT_PX}px"
						onclick={() => viewer.toggleCluster(row.id)}
						title={row.info.cluster.summary ?? row.id}
					>
						<span class="chev" class:open={row.expanded}>▸</span>
						<span class="g-name">{row.info.cluster.name}</span>
						<span class="g-meta">{row.members.length}{#if row.info.cluster.backlog?.length}<span class="backlog-count">+{row.info.cluster.backlog.length}</span>{/if}</span>
						<span class="status status-{row.info.cluster.research_status ?? 'none'}" title="research status: {row.info.cluster.research_status ?? 'unset'}"></span>
					</button>
					<button
						class="g-info"
						style:top="{row.y}px"
						style:height="{ROW_H}px"
						onclick={() => viewer.selectCluster(row.id)}
						title="Cluster details, backlog and research questions"
						aria-label="Details for {row.info.cluster.name}">ⓘ</button
					>
				{:else}
					<button
						class="g-row g-node"
						style:height="{ROW_H}px"
						class:selected={selNode === row.id}
						class:dim={!lit(row.id)}
						style:top="{row.y}px"
						style:padding-left="{6 + row.depth * INDENT_PX + 14}px"
						onclick={() => viewer.toggleNode(row.id, false)}
						onpointerenter={() => (viewer.hover = { type: 'node', id: row.id })}
						onpointerleave={() => (viewer.hover = null)}
					>
						<span class="kind-dot kind-{row.node.kind}"></span>
						<span class="g-name">{row.node.name}</span>
						{#if row.node.example}<span class="has-code" title="has a code example (hover)">&lt;/&gt;</span>{/if}
						<span class="g-meta">{firstYear(row.node)}</span>
					</button>
				{/if}
			{/each}
		</div>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg class="plot" width={scale.width} height={lay.height + ROW_H} onclick={onBackgroundClick}>
			<defs>
				{#each ['succession', 'influence', 'variant', 'targets', 'implementation'] as f (f)}
					<marker id="arrow-{f}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
						<path d="M0,0 L8,4 L0,8 z" class="arrowhead fam-{f}" />
					</marker>
				{/each}
			</defs>

			{#each eras as era (era.id)}
				<rect x={era.x1} y="0" width={Math.max(0, era.x2 - era.x1)} height={lay.height + ROW_H} class="era-band era-{era.i % 2}" />
			{/each}
			{#each ticks as t (t.year)}
				<line x1={scale.x(t.year)} x2={scale.x(t.year)} y1="0" y2={lay.height + ROW_H} class="grid-line" class:major={t.major} />
			{/each}
			<line x1={scale.x(NOW)} x2={scale.x(NOW)} y1="0" y2={lay.height + ROW_H} class="now-line" />

			{#each lay.rows as row (row.type + row.id)}
				{#if row.type === 'cluster'}
					<rect x="0" y={row.y} width={scale.width} height={ROW_H} class="row-bg cluster-bg depth-{Math.min(row.depth, 3)}" />
				{/if}
			{/each}

			<g class="edges" class:filtering>
				{#each edges as e (e.key)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<path
						d={edgePath(e)}
						class="edge fam-{e.family} conf-{e.edge.confidence ?? 'medium'}"
						class:on={e.on}
						class:hot={e.hot}
						stroke-width={(WIDTH[e.edge.weight ?? 'moderate'] ?? 1.2) + Math.min(2, (e.count - 1) * 0.5)}
						marker-end="url(#arrow-{e.family})"
						onpointerenter={() => (viewer.hover = { type: 'edge', from: e.edge.from, to: e.edge.to, idx: edgeIndex(e.edge) })}
						onpointerleave={() => (viewer.hover = null)}
					/>
				{/each}
			</g>

			{#each lay.rows as row (row.type + row.id)}
				{#if row.type === 'cluster'}
					{@const cy = row.y + ROW_H / 2}
					{#if isFinite(row.info.start)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<rect
							x={scale.x(row.info.start) - 4}
							y={cy - (row.expanded ? 1 : 6)}
							width={Math.max(8, scale.x(row.info.end) - scale.x(row.info.start) + 8)}
							height={row.expanded ? 2 : 12}
							rx="6"
							class="cluster-span"
							onclick={() => viewer.toggleCluster(row.id)}
						/>
					{/if}
					{#each row.info.cluster.backlog ?? [] as b, i (i)}
						{#if typeof b.year === 'number'}
							<circle cx={scale.x(b.year)} cy={cy} r="3.5" class="backlog">
								<title>backlog: {b.name} ({b.year}){b.hint ? '\n' + b.hint : ''}</title>
							</circle>
						{/if}
					{/each}
					{#if !row.expanded}
						{@const members = clusterLabels(row)}
						{#each members as { n, x } (n.id)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<circle
								cx={x}
								cy={cy}
								r="4"
								class="member dot kind-{n.kind} rs-{n.research_status}"
								class:dim={!lit(n.id)}
								class:sel={selNode === n.id}
								onclick={() => viewer.toggleNode(n.id)}
								onpointerenter={() => (viewer.hover = { type: 'node', id: n.id })}
								onpointerleave={() => (viewer.hover = null)}
							/>
						{/each}
						{#each members as { n, x, show } (n.id)}
							{#if show}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<text
									x={x + 7}
									y={cy + 4}
									class="member-label"
									class:dim={!lit(n.id)}
									onclick={() => viewer.toggleNode(n.id)}
									onpointerenter={() => (viewer.hover = { type: 'node', id: n.id })}
									onpointerleave={() => (viewer.hover = null)}>{n.name}</text
								>
							{/if}
						{/each}
					{/if}
				{:else}
					{@const n = row.node}
					{@const cy = row.y + ROW_H / 2}
					{@const x0 = scale.x(n.origin.began?.year ?? firstYear(n))}
					{@const x1 = scale.x(firstYear(n))}
					{@const x2 = scale.x(endYear(n))}
					{@const arrival = arrivals.get(n.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g
						class="node"
						class:dim={!lit(n.id)}
						class:sel={selNode === n.id}
						class:step={stepSet.has(n.id)}
						onclick={() => viewer.toggleNode(n.id, false)}
						onpointerenter={() => (viewer.hover = { type: 'node', id: n.id })}
						onpointerleave={() => (viewer.hover = null)}
					>
						<rect x="0" y={row.y} width={scale.width} height={ROW_H} class="row-hit" />
						{#if x1 > x0}
							<rect x={x0} y={cy - 3} width={x1 - x0} height="6" rx="3" class="design kind-{n.kind}">
								<title>design / development from {n.origin.began?.year}{n.origin.began?.note ? '\n' + n.origin.began.note : ''}</title>
							</rect>
						{/if}
						{#if x2 > x1}
							<line x1={x1} x2={x2} y1={cy} y2={cy} class="life status-{n.status ?? 'unknown'}" />
							{#if n.status === 'extinct' || n.status === 'historical'}
								<line x1={x2} x2={x2} y1={cy - 4} y2={cy + 4} class="life-end" />
							{/if}
						{/if}
						{#each n.milestones ?? [] as m (m.version + m.year)}
							<line x1={scale.x(m.year)} x2={scale.x(m.year)} y1={cy - 5} y2={cy + 5} class="milestone">
								<title>{m.version} ({m.year}){m.introduces?.length ? '\nintroduces: ' + m.introduces.join(', ') : ''}{m.summary ? '\n' + m.summary : ''}</title>
							</line>
						{/each}
						<circle cx={x1} cy={cy} r="5.5" class="dot kind-{n.kind} rs-{n.research_status}" />
						{#if arrival}
							<path d="M{scale.x(arrival.year)},{cy - 7} l6,7 l-6,7 l-6,-7 z" class="arrival">
								<title>{viewer.concept} {arrival.version ? `in ${arrival.version} ` : ''}({arrival.year})</title>
							</path>
						{/if}
						{#if labelLeft(n)}
							<text x={x0 - 8} y={cy + 4} class="node-label" text-anchor="end">{n.name}</text>
						{:else}
							<text x={Math.max(x1, x2) + 9} y={cy + 4} class="node-label">{n.name}</text>
						{/if}
					</g>
				{/if}
			{/each}
		</svg>
	</div>
</div>

{#if tooltip && pointer.mouse}
	{@const flipX = pointer.x > winW * 0.55}
	{@const flipY = pointer.y > winH * 0.55}
	<div
		class="tooltip"
		class:wide={tooltip.example}
		style:left={flipX ? null : `${pointer.x + 14}px`}
		style:right={flipX ? `${winW - pointer.x + 14}px` : null}
		style:top={flipY ? null : `${pointer.y + 14}px`}
		style:bottom={flipY ? `${winH - pointer.y + 14}px` : null}
	>
		<strong>{tooltip.title}</strong>
		<div class="tt-sub">{tooltip.sub}</div>
		{#if tooltip.body}<div class="tt-body">{tooltip.body}</div>{/if}
		{#if tooltip.example}
			{@const ex = tooltip.example}
			{#if ex.title || ex.language}
				<div class="tt-ex-head">{ex.title ?? ''}{ex.language ? ` · ${ex.language}` : ''}{ex.year ? ` (${ex.year})` : ''}</div>
			{/if}
			<pre class="code">{ex.code.trimEnd()}</pre>
		{/if}
	</div>
{/if}

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

<style>
	.scroller {
		position: relative;
		touch-action: pan-x pan-y;
		overflow: auto;
		height: 100%;
		overscroll-behavior: contain;
	}
	.grid {
		display: grid;
		position: relative;
	}
	.corner {
		position: sticky;
		top: 0;
		left: 0;
		z-index: 4;
		background: var(--bg-raised);
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0 10px;
		font-size: 11px;
		color: var(--fg-muted);
	}
	.corner span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.corner .hint {
		opacity: 0.7;
	}
	.axis {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--bg-raised);
		border-bottom: 1px solid var(--line);
		display: block;
	}
	.gutter {
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--bg-raised);
		border-right: 1px solid var(--line);
	}
	.plot {
		display: block;
	}

	/* axis */
	.era {
		stroke: var(--line);
		stroke-width: 0.5;
	}
	.era-0 {
		fill: var(--era-a);
	}
	.era-1 {
		fill: var(--era-b);
	}
	.era-label {
		font-size: 10.5px;
		fill: var(--fg-muted);
		pointer-events: none;
	}
	.tick {
		stroke: var(--fg-faint);
	}
	.tick-label {
		font-size: 10px;
		fill: var(--fg-faint);
		text-anchor: middle;
	}
	.tick-label.major {
		fill: var(--fg);
		font-weight: 600;
	}

	/* gutter rows */
	.g-row {
		all: unset;
		box-sizing: border-box;
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding-right: 8px;
		font-size: 12.5px;
		cursor: pointer;
		white-space: nowrap;
	}
	.g-row:hover {
		background: var(--hover);
	}
	.g-row.selected {
		background: var(--accent-soft);
	}
	.g-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.g-cluster {
		font-weight: 600;
		padding-right: 28px;
	}
	@media (max-width: 899px) {
		.g-row .g-meta,
		.g-row .status {
			display: none;
		}
		.g-row {
			font-size: 12px;
			gap: 4px;
		}
		.g-cluster {
			padding-right: 22px;
		}
		.corner {
			font-size: 10px;
			padding: 0 6px;
		}
	}
	.g-info {
		all: unset;
		position: absolute;
		right: 4px;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		color: var(--fg-faint);
		cursor: pointer;
		z-index: 1;
	}
	.g-info:hover,
	.g-info:focus-visible {
		color: var(--accent);
	}
	.g-cluster.synthetic .g-name {
		font-style: italic;
		color: var(--warn);
	}
	.g-name {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.g-meta {
		font-size: 10.5px;
		color: var(--fg-faint);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.backlog-count {
		margin-left: 3px;
		color: var(--fg-faint);
		opacity: 0.8;
	}
	.g-node.dim {
		opacity: 0.4;
	}
	.g-node.dim:hover {
		opacity: 0.8;
	}
	.chev {
		display: inline-block;
		width: 10px;
		transition: transform 0.12s;
		color: var(--fg-muted);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.status {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1px solid var(--fg-faint);
	}
	.status-draft {
		background: var(--rs-draft);
		border-color: var(--rs-draft);
	}
	.status-reviewed {
		background: var(--rs-reviewed);
		border-color: var(--rs-reviewed);
	}
	.kind-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
		background: var(--k);
	}

	/* plot */
	.era-band {
		opacity: 0.5;
	}
	.grid-line {
		stroke: var(--grid);
		stroke-width: 0.5;
	}
	.grid-line.major {
		stroke: var(--grid-major);
	}
	.now-line {
		stroke: var(--accent);
		stroke-dasharray: 2 4;
	}
	.row-bg.cluster-bg {
		fill: var(--cluster-row);
	}
	.row-bg.depth-0 {
		fill: var(--cluster-row-0);
	}
	.cluster-span {
		fill: var(--span);
	}
	.backlog {
		fill: none;
		stroke: var(--fg-faint);
		stroke-dasharray: 2 2;
	}
	.row-hit {
		fill: transparent;
	}
	.node:hover .row-hit {
		fill: var(--hover);
	}

	.edge {
		fill: none;
		stroke: var(--f);
		opacity: 0.55;
		transition: opacity 0.12s;
	}
	.edge.conf-low {
		stroke-dasharray: 3 3;
	}
	.edges.filtering .edge {
		opacity: 0.06;
	}
	.edges.filtering .edge.on,
	.edge.hot {
		opacity: 0.95;
	}
	.edge:hover {
		opacity: 1;
		stroke-width: 3;
	}
	.arrowhead {
		fill: var(--f);
	}
	.fam-succession {
		--f: var(--fam-succession);
	}
	.fam-influence {
		--f: var(--fam-influence);
	}
	.fam-variant {
		--f: var(--fam-variant);
	}
	.fam-targets {
		--f: var(--fam-targets);
	}
	.fam-implementation {
		--f: var(--fam-implementation);
	}

	.node,
	.member {
		cursor: pointer;
		transition: opacity 0.12s;
	}
	.node.dim,
	.member.dim {
		opacity: 0.22;
	}
	/* hovering a dimmed item brings it partway back, so it can be read without losing the focus */
	.node.dim:hover,
	.member.dim:hover {
		opacity: 0.7;
	}
	.dot {
		fill: var(--k);
		stroke: var(--bg);
		stroke-width: 1.5;
	}
	.dot.rs-stub {
		fill: var(--bg);
		stroke: var(--k);
		stroke-width: 1.8;
	}
	.dot.rs-reviewed {
		stroke: var(--rs-reviewed);
		stroke-width: 2.2;
	}
	.member-label {
		cursor: pointer;
	}
	.member-label:hover {
		fill: var(--fg);
	}
	.member-label.dim {
		opacity: 0.22;
	}
	.member-label.dim:hover {
		opacity: 0.7;
	}
	.cluster-span {
		cursor: pointer;
	}
	.member.dot {
		stroke-width: 4px;
		stroke: transparent;
	}
	.member.dot.rs-stub {
		stroke: var(--k);
		stroke-width: 1.8px;
	}
	.member.dot.rs-reviewed {
		stroke: var(--rs-reviewed);
		stroke-width: 2.2px;
	}
	.dot.sel,
	.sel .dot {
		stroke: var(--accent);
		stroke-width: 3;
	}
	.step .dot {
		stroke: var(--warn);
		stroke-width: 3;
	}
	.design {
		fill: var(--k);
		opacity: 0.25;
	}
	.life {
		stroke: var(--fg-faint);
		stroke-width: 2;
	}
	.life.status-active,
	.life.status-maintained {
		stroke: var(--fg-muted);
		stroke-width: 2.5;
	}
	.life.status-legacy {
		stroke-dasharray: 6 3;
	}
	.life-end {
		stroke: var(--fg-faint);
		stroke-width: 1.5;
	}
	.milestone {
		stroke: var(--fg-muted);
		stroke-width: 1.5;
	}
	.arrival {
		fill: var(--warn);
		stroke: var(--bg);
		stroke-width: 1;
	}
	.node-label {
		font-size: 12px;
		fill: var(--fg);
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.sel .node-label {
		font-weight: 700;
	}
	.member-label {
		font-size: 10.5px;
		fill: var(--fg-muted);
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 3px;
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

	.tooltip {
		position: fixed;
		z-index: 50;
		max-width: 360px;
		pointer-events: none;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 12px;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
	}
	.tooltip.wide {
		max-width: min(640px, calc(100vw - 32px));
	}
	.tt-ex-head {
		margin-top: 8px;
		font-size: 11px;
		color: var(--fg-muted);
	}
	.code {
		margin: 4px 0 0;
		padding: 8px 10px;
		background: var(--code-bg);
		border-radius: 5px;
		font-family: var(--mono);
		font-size: 11.5px;
		line-height: 1.45;
		white-space: pre;
		overflow: hidden;
		max-height: 340px;
	}
	.has-code {
		font-family: var(--mono);
		font-size: 9.5px;
		color: var(--accent);
		opacity: 0.8;
	}
	.tt-sub {
		color: var(--fg-muted);
		font-size: 11px;
		margin-top: 2px;
	}
	.tt-body {
		margin-top: 6px;
		white-space: pre-line;
		display: -webkit-box;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
