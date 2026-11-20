<script lang="ts">
	// Every node placed by similarity of its relations, concepts and cluster: t-SNE in 2D or 3D, or a SOM.
	import { viewer, type MapMethod } from '#lib/viewer.svelte.ts';
	import { FAMILY_OF, firstYear } from '#lib/graph.ts';
	import type { SOM } from '#lib/embed.ts';
	import { mapJob } from '#lib/mapjob.svelte.ts';
	import { untrack } from 'svelte';
	import { NOW } from '#lib/scale.ts';
	import Button from '../atoms/Button.svelte';

	const METHODS: { id: MapMethod; label: string }[] = [
		{ id: 'tsne2', label: 't-SNE 2D' },
		{ id: 'tsne3', label: 't-SNE 3D' },
		{ id: 'som', label: 'SOM' }
	];
	const PAD = 28;
	const Y0 = 1940;

	const g = $derived(viewer.graph);
	const res = $derived(mapJob.result[viewer.mapMethod]);
	const ids = $derived(res?.ids ?? []);
	/** t-SNE coordinates, n * dims */
	const Y = $derived(res?.Y ?? null);
	const grid = $derived<SOM | null>(res?.som ?? null);
	/** 0..1 while the worker cooks the shown method; null when ready */
	const cooking = $derived(res ? null : (mapJob.progress[viewer.mapMethod] ?? 0));
	let w = $state(800);
	let h = $state(600);
	let yaw = $state(0.6);
	let pitch = $state(-0.35);
	let spin = $state(true);
	let hover = $state<number | null>(null);

	// the worker usually finished long ago; if not, cook what is on screen first
	$effect(() => {
		const m = viewer.mapMethod;
		untrack(() => mapJob.prioritize(m));
	});

	// slow turn in 3D until the user grabs it
	$effect(() => {
		if (viewer.mapMethod !== 'tsne3' || !spin || viewer.reducedMotion.current) return;
		let raf = requestAnimationFrame(function turn() {
			yaw += 0.004;
			raf = requestAnimationFrame(turn);
		});
		return () => cancelAnimationFrame(raf);
	});

	interface Pt {
		i: number;
		x: number;
		y: number;
		/** 0 far .. 1 near (3D only) */
		z: number;
	}

	const points = $derived.by((): Pt[] => {
		if (grid) {
			const cw = (w - 2 * PAD) / grid.cols, ch = (h - 2 * PAD) / grid.rows;
			const members = new Map<number, number[]>();
			grid.cell.forEach((c, i) => (members.get(c) ?? members.set(c, []).get(c)!).push(i));
			const out: Pt[] = [];
			for (const [c, list] of members) {
				const m = Math.ceil(Math.sqrt(list.length));
				list.forEach((i, k) => {
					out.push({
						i,
						x: PAD + ((c % grid!.cols) + ((k % m) + 0.5) / m) * cw,
						y: PAD + (Math.floor(c / grid!.cols) + (Math.floor(k / m) + 0.5) / m) * ch,
						z: 1
					});
				});
			}
			return out;
		}
		if (!Y) return [];
		const dims = Y.length / ids.length;
		const raw = ids.map((_, i) => {
			let [x, y, z] = [Y![i * dims], Y![i * dims + 1], dims === 3 ? Y![i * dims + 2] : 0];
			if (dims === 3) {
				[x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
				[y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
			}
			return { i, x, y, z };
		});
		// 3D: scale by radius so turning doesn't make the cloud breathe; 2D: fit the bounding box
		const r = dims === 3 ? Math.max(...raw.map((p) => Math.hypot(p.x, p.y, p.z))) : 0;
		const [x0, x1] = dims === 3 ? [-r, r] : [Math.min(...raw.map((p) => p.x)), Math.max(...raw.map((p) => p.x))];
		const [y0, y1] = dims === 3 ? [-r, r] : [Math.min(...raw.map((p) => p.y)), Math.max(...raw.map((p) => p.y))];
		const s = Math.min((w - 2 * PAD) / (x1 - x0 || 1), (h - 2 * PAD) / (y1 - y0 || 1));
		const cx = w / 2 - ((x0 + x1) / 2) * s, cy = h / 2 - ((y0 + y1) / 2) * s;
		const pts = raw.map((p) => ({ i: p.i, x: cx + p.x * s, y: cy + p.y * s, z: dims === 3 ? (p.z / (r || 1) + 1) / 2 : 1 }));
		// far points first, so near ones paint on top
		return dims === 3 ? pts.sort((a, b) => a.z - b.z) : pts;
	});

	const at = $derived(new Map(points.map((p) => [ids[p.i], p])));
	const selId = $derived(viewer.selected?.type === 'node' ? viewer.selected.id : null);
	const selLinks = $derived(
		selId && at.has(selId)
			? [...(g.outgoing.get(selId) ?? []).map((e) => e.to), ...(g.incoming.get(selId) ?? []).map((e) => e.from)].filter(
					(o, k, all) => at.has(o) && all.indexOf(o) === k
				)
			: []
	);
	const selFamily = (o: string) => {
		const e = (g.outgoing.get(selId!) ?? []).find((e) => e.to === o) ?? (g.incoming.get(selId!) ?? []).find((e) => e.from === o);
		return e ? FAMILY_OF[e.type] : 'influence';
	};

	/** sequential year colour: violet (1940 and before) through teal to amber (now) */
	function colour(id: string): string {
		const t = Math.min(1, Math.max(0, (firstYear(g.node.get(id)!) - Y0) / (NOW - Y0)));
		return `oklch(0.68 0.15 ${290 - t * 220})`;
	}

	let drag: { x: number; y: number } | null = null;
	function down(ev: PointerEvent) {
		if (viewer.mapMethod !== 'tsne3') return;
		ev.preventDefault(); // else the drag selects the toolbar and caption text
		drag = { x: ev.clientX, y: ev.clientY };
		spin = false;
		(ev.currentTarget as Element).setPointerCapture(ev.pointerId);
	}
	function move(ev: PointerEvent) {
		if (!drag) return;
		yaw += (ev.clientX - drag.x) * 0.01;
		pitch = Math.max(-1.5, Math.min(1.5, pitch + (ev.clientY - drag.y) * 0.01));
		drag = { x: ev.clientX, y: ev.clientY };
	}
	function key(ev: KeyboardEvent) {
		if (viewer.mapMethod !== 'tsne3') return;
		const d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[ev.key];
		if (!d) return;
		ev.preventDefault();
		spin = false;
		yaw += d[0];
		pitch = Math.max(-1.5, Math.min(1.5, pitch + d[1]));
	}
	const name = (i: number) => g.node.get(ids[i])?.name ?? ids[i];
</script>

<div class="map">
	<div class="bar">
		<div class="methods" role="group" aria-label="Layout method">
			{#each METHODS as m (m.id)}
				<Button variant="pill" aria-pressed={viewer.mapMethod === m.id} onclick={() => (viewer.mapMethod = m.id)}>{m.label}</Button>
			{/each}
		</div>
		<span class="status" role="status">
			{#if cooking !== null}<span class="spinner" aria-hidden="true"></span>Cooking… {Math.round(cooking * 100)}%{:else if grid}{grid.cols}×{grid.rows} cells{/if}
		</span>
		<span class="ramp" aria-label="Colour: first appeared, {Y0} or earlier to now"><span>≤{Y0}</span><span class="grad"></span><span>now</span></span>
		<span class="caption">
			Placed by shared relations (2 hops), concepts and cluster; year is not an input. Axes and gaps between far groups mean nothing.
			{#if viewer.mapMethod === 'tsne3'}Drag or arrow keys to turn.{/if}
			{#if viewer.mapMethod === 'som'}Dark cell borders = big jumps between neighbouring cells.{/if}
		</span>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="plot"
		id="timeline"
		role="region"
		aria-label="Similarity map; pick a language with Ctrl+K to highlight it"
		tabindex="0"
		bind:clientWidth={w}
		bind:clientHeight={h}
		onkeydown={key}
	>
		{#if cooking !== null}
			<p class="cooking"><span class="spinner big" aria-hidden="true"></span>Cooking the map… {Math.round(cooking * 100)}%</p>
		{/if}
		<svg
			width={w}
			height={h}
			aria-hidden="true"
			class:grab={viewer.mapMethod === 'tsne3'}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={() => (drag = null)}
			onpointercancel={() => (drag = null)}
		>
			{#if grid}
				{@const cw = (w - 2 * PAD) / grid.cols}
				{@const ch = (h - 2 * PAD) / grid.rows}
				{#each grid.umatrix as u, c (c)}
					<rect x={PAD + (c % grid.cols) * cw} y={PAD + Math.floor(c / grid.cols) * ch} width={cw} height={ch} class="cell" style:--u="{Math.round(u * 40)}%" />
				{/each}
			{/if}

			{#if selId && at.has(selId)}
				{@const s = at.get(selId)!}
				{#each selLinks as o (o)}
					{@const p = at.get(o)!}
					<line x1={s.x} y1={s.y} x2={p.x} y2={p.y} class="link fam-{selFamily(o)}" />
				{/each}
			{/if}

			{#each points as p (p.i)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<circle
					cx={p.x}
					cy={p.y}
					r={(ids[p.i] === selId ? 6 : 3.2) * (0.6 + 0.4 * p.z)}
					fill={colour(ids[p.i])}
					opacity={0.3 + 0.7 * p.z}
					class:sel={ids[p.i] === selId}
					class:linked={selLinks.includes(ids[p.i])}
					onpointerenter={() => (hover = p.i)}
					onpointerleave={() => (hover = null)}
					onclick={() => viewer.selectNode(ids[p.i], false)}
				/>
			{/each}

			{#each [selId ? at.get(selId) : undefined, hover !== null ? points.find((p) => p.i === hover) : undefined] as p, k (k)}
				{#if p}
					<text x={p.x + 8} y={p.y + 4} class="label">{name(p.i)} · {firstYear(g.node.get(ids[p.i])!)}</text>
				{/if}
			{/each}
		</svg>
	</div>
</div>

<style>
	.map {
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
	.methods {
		display: inline-flex;
		gap: var(--space-1);
	}
	.status,
	.caption {
		color: var(--fg-muted);
	}
	.status {
		font-variant-numeric: tabular-nums;
		min-width: 14ch;
	}
	.caption {
		flex-basis: 100%;
		font-size: var(--text-xs);
	}
	.ramp {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--fg-muted);
		font-size: var(--text-xs);
	}
	.grad {
		width: 90px;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to right in oklch longer hue, oklch(0.68 0.15 290), oklch(0.68 0.15 70));
	}
	.spinner {
		display: inline-block;
		width: 0.9em;
		height: 0.9em;
		margin-right: var(--space-2);
		vertical-align: -0.1em;
		border: 2px solid var(--line);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	.spinner.big {
		width: 1.4em;
		height: 1.4em;
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.cooking {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		grid-auto-flow: column;
		align-items: center;
		margin: 0;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.plot {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		outline-offset: -2px;
	}
	svg {
		display: block;
		touch-action: none;
		user-select: none;
	}
	svg.grab {
		cursor: grab;
	}
	svg.grab:active {
		cursor: grabbing;
	}
	.cell {
		fill: color-mix(in srgb, var(--fg) var(--u), var(--bg));
		stroke: var(--bg);
		stroke-width: 0.5;
	}
	circle {
		cursor: pointer;
		stroke: var(--bg);
		stroke-width: 0.6;
	}
	circle:hover,
	circle.linked {
		stroke: var(--fg);
		stroke-width: 1.2;
	}
	circle.sel {
		stroke: var(--accent);
		stroke-width: 2.5;
	}
	.link {
		stroke: var(--fam);
		stroke-width: 1.2;
		opacity: 0.7;
	}
	.label {
		font-size: var(--text-sm);
		fill: var(--fg);
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 3px;
		pointer-events: none;
	}
</style>
