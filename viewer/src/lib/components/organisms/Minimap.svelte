<script lang="ts">
	import { viewer } from '#lib/viewer.svelte.ts';
	import { firstYear } from '#lib/graph.ts';
	import { timeScale } from '#lib/scale.ts';

	interface Props {
		/** horizontal scroll offset and widths of the plot, in plot pixels at the current zoom */
		scrollX: number;
		plotWidth: number;
		viewWidth: number;
		onscrollto: (x: number) => void;
		onzoom: (factor: number) => void;
	}

	let { scrollX, plotWidth, viewWidth, onscrollto, onzoom }: Props = $props();

	const H = 22;
	const COL = 3;
	// zoom only stretches the axis, so positions as a fraction of its width are zoom-independent
	const s1 = timeScale(1);
	let w = $state(0);

	/** first-appearance count per 3px column, over the whole span */
	const cols = $derived.by(() => {
		if (!w) return [];
		const n = Math.ceil(w / COL);
		const counts = new Array<number>(n).fill(0);
		for (const node of viewer.graph.data.nodes) {
			const i = Math.floor(((s1.x(firstYear(node)) / s1.width) * w) / COL);
			counts[Math.max(0, Math.min(n - 1, i))]++;
		}
		const max = Math.max(1, ...counts);
		return counts.map((c, i) => ({ x: i * COL, h: c ? Math.max(1.5, (c / max) * (H - 4)) : 0 }));
	});

	const f0 = $derived(plotWidth ? scrollX / plotWidth : 0);
	const f1 = $derived(plotWidth ? Math.min(1, (scrollX + viewWidth) / plotWidth) : 1);
	const yearAt = (f: number) => Math.round(s1.year(f * s1.width));
	const fmt = (y: number) => (y < 0 ? `${-y} BC` : String(y));

	const panTo = (frac: number) => onscrollto(frac * plotWidth - viewWidth / 2);

	let dragging = false;
	function onDown(ev: PointerEvent) {
		dragging = true;
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
		panTo(ev.offsetX / w);
	}
	function onMove(ev: PointerEvent) {
		if (dragging) panTo(ev.offsetX / w);
	}

	function onKey(ev: KeyboardEvent) {
		const step = { ArrowLeft: -0.25, ArrowRight: 0.25, PageUp: -1, PageDown: 1 }[ev.key];
		if (step !== undefined) onscrollto(scrollX + step * viewWidth);
		else if (ev.key === 'Home') onscrollto(0);
		else if (ev.key === 'End') onscrollto(plotWidth);
		else if (ev.key === '+' || ev.key === '=') onzoom(1.4);
		else if (ev.key === '-') onzoom(1 / 1.4);
		else return;
		ev.preventDefault();
	}
</script>

<!-- Overview of the whole span: bars = languages appearing, box = what is on screen.
     Click or drag to move; as a slider, arrows pan and +/− zoom. -->
<div
	class="minimap"
	bind:clientWidth={w}
	role="slider"
	tabindex="0"
	aria-label="Timeline overview"
	aria-valuemin={yearAt(0)}
	aria-valuemax={yearAt(1)}
	aria-valuenow={yearAt((f0 + f1) / 2)}
	aria-valuetext="showing {fmt(yearAt(f0))} to {fmt(yearAt(f1))}"
	aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown Home End + -"
	title="Overview: click or drag to move; arrows pan, + and − zoom"
	onpointerdown={onDown}
	onpointermove={onMove}
	onpointerup={() => (dragging = false)}
	onpointercancel={() => (dragging = false)}
	onkeydown={onKey}
>
	<svg width={w} height={H} aria-hidden="true">
		{#each cols as c (c.x)}
			{#if c.h}<rect x={c.x} y={H - 2 - c.h} width={COL - 1} height={c.h} class="bar" />{/if}
		{/each}
		<rect x={f0 * w} y="1" width={Math.max(4, (f1 - f0) * w)} height={H - 2} rx="2" class="view" />
	</svg>
</div>

<style>
	.minimap {
		height: 22px;
		cursor: pointer;
		touch-action: none;
		background: var(--bg-raised);
		border-bottom: 1px solid var(--line);
	}
	.minimap:focus-visible {
		outline-offset: -2px;
	}
	svg {
		display: block;
	}
	.bar {
		fill: var(--fg-faint);
	}
	.view {
		fill: var(--accent-soft);
		stroke: var(--accent);
		stroke-width: 1.5;
	}
</style>
