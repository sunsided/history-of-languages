<script lang="ts">
	import Toolbar from '#lib/components/organisms/Toolbar.svelte';
	import Timeline from '#lib/components/organisms/Timeline.svelte';
	import Network from '#lib/components/organisms/Network.svelte';
	import DetailPanel from '#lib/components/organisms/DetailPanel.svelte';
	import CommandPalette from '#lib/components/organisms/CommandPalette.svelte';
	import PathFinder from '#lib/components/organisms/PathFinder.svelte';
	import FocusBar from '#lib/components/organisms/FocusBar.svelte';
	import { SHEET, viewer, type SheetSnap } from '#lib/viewer.svelte.ts';
	import '../app.css';

	// Folded by default. Wide: opens as a right column. Narrow: opens as a bottom sheet over the timeline.

	const MIN_W = 300;
	const maxW = () => Math.min(760, window.innerWidth * 0.6);
	const setWidth = (w: number) => (viewer.panelWidth = Math.round(Math.max(MIN_W, Math.min(maxW(), w))));
	const currentWidth = () => document.querySelector('.panel-slot')?.getBoundingClientRect().width ?? 380;

	let resizing = false;
	function onResizeDown(ev: PointerEvent) {
		resizing = true;
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
	}
	function onResizeMove(ev: PointerEvent) {
		if (resizing) setWidth(window.innerWidth - ev.clientX);
	}
	// ---- narrow screens: bottom sheet with three snap heights ----
	const SNAPS = Object.keys(SHEET) as SheetSnap[];
	const SNAP_LABEL: Record<SheetSnap, string> = { peek: 'peek', half: 'half height', full: 'full height' };
	let mainEl: HTMLElement | undefined = $state();
	/** live height while dragging the grip, px */
	let dragH = $state<number | null>(null);
	let drag: { y: number; h: number; moved: boolean } | null = null;

	function onGripDown(ev: PointerEvent) {
		const slot = (ev.currentTarget as HTMLElement).parentElement!;
		drag = { y: ev.clientY, h: slot.getBoundingClientRect().height, moved: false };
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
	}
	function onGripMove(ev: PointerEvent) {
		if (!drag || !mainEl) return;
		const dy = drag.y - ev.clientY;
		if (Math.abs(dy) > 6) drag.moved = true;
		if (drag.moved) dragH = Math.max(80, Math.min(mainEl.clientHeight, drag.h + dy));
	}
	function onGripUp() {
		if (drag?.moved && dragH !== null && mainEl) {
			const f = dragH / mainEl.clientHeight;
			// snap to the nearest height; a short flick down from peek folds the sheet
			if (f < SHEET.peek * 0.6) viewer.panelOpen = false;
			else viewer.sheet = SNAPS.reduce((a, b) => (Math.abs(SHEET[b] - f) < Math.abs(SHEET[a] - f) ? b : a));
		}
		dragH = null;
	}
	function onGripClick() {
		if (drag?.moved) return void (drag = null);
		drag = null;
		viewer.sheet = SNAPS[(SNAPS.indexOf(viewer.sheet) + 1) % SNAPS.length];
	}
	function onGripKey(ev: KeyboardEvent) {
		const i = SNAPS.indexOf(viewer.sheet);
		if (ev.key === 'ArrowUp') viewer.sheet = SNAPS[Math.min(SNAPS.length - 1, i + 1)];
		else if (ev.key === 'ArrowDown') viewer.sheet = SNAPS[Math.max(0, i - 1)];
		else return;
		ev.preventDefault();
	}

	function onResizeKey(ev: KeyboardEvent) {
		const step = ev.shiftKey ? 64 : 16;
		if (ev.key === 'ArrowLeft') setWidth(currentWidth() + step);
		else if (ev.key === 'ArrowRight') setWidth(currentWidth() - step);
		else if (ev.key === 'Home') viewer.panelWidth = null;
		else return;
		ev.preventDefault();
	}
</script>

<svelte:head>
	<title>History of languages</title>
</svelte:head>

<div class="app">
	<!-- focus explicitly: the router handles fragment links as navigation, not as a focus move -->
	<a
		class="skip"
		href="#timeline"
		onclick={(e) => {
			e.preventDefault();
			document.getElementById('timeline')?.focus();
		}}>Skip to {viewer.view}</a
	>
	<Toolbar />
	<FocusBar />
	<main bind:this={mainEl} class:narrow={viewer.narrow.current} class:open={viewer.panelOpen} style:--panel-w={viewer.panelWidth ? `${viewer.panelWidth}px` : null}>
		{#if viewer.view === 'network'}<Network />{:else}<Timeline />{/if}
		{#if viewer.panelOpen}
			<div class="panel-slot" class:dragging={dragH !== null} style:height={viewer.narrow.current ? (dragH !== null ? `${dragH}px` : `${SHEET[viewer.sheet] * 100}%`) : null}>
				{#if viewer.narrow.current}
					<button
						class="grip"
						aria-label="Details sheet at {SNAP_LABEL[viewer.sheet]}; change height"
						title="Drag, tap, or use the up and down arrows to resize"
						onpointerdown={onGripDown}
						onpointermove={onGripMove}
						onpointerup={onGripUp}
						onpointercancel={() => ((dragH = null), (drag = null))}
						onclick={onGripClick}
						onkeydown={onGripKey}><span class="bar" aria-hidden="true"></span></button
					>
				{:else}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
					<div
						class="resize"
						role="separator"
						aria-orientation="vertical"
						aria-label="Resize details panel"
						aria-valuenow={viewer.panelWidth ?? undefined}
						aria-valuemin={MIN_W}
						tabindex="0"
						title="Drag to resize; arrows on the keyboard, Home resets"
						onpointerdown={onResizeDown}
						onpointermove={onResizeMove}
						onpointerup={() => (resizing = false)}
						onpointercancel={() => (resizing = false)}
						onkeydown={onResizeKey}
						ondblclick={() => (viewer.panelWidth = null)}
					></div>
				{/if}
				<DetailPanel />
			</div>
		{/if}
	</main>
</div>

{#if viewer.paletteOpen}
	<CommandPalette />
{/if}
{#if viewer.pathOpen}
	<PathFinder />
{/if}

<style>
	.skip {
		position: absolute;
		z-index: var(--z-tooltip);
		left: var(--space-4);
		top: var(--space-4);
		padding: var(--space-3) var(--space-5);
		background: var(--bg);
		color: var(--accent);
		border: var(--focus-ring);
		border-radius: var(--radius-md);
		transform: translateY(-200%);
	}
	.skip:focus {
		transform: none;
	}
	.app {
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
	}
	main {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	main.open {
		grid-template-columns: minmax(0, 1fr) var(--panel-w, clamp(320px, 30vw, 480px));
	}
	.panel-slot {
		position: relative;
		min-height: 0;
		min-width: 0;
	}
	.resize {
		position: absolute;
		z-index: 2;
		left: -4px;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		touch-action: none;
	}
	.resize:hover,
	.resize:focus-visible {
		background: var(--accent-soft);
		box-shadow: inset 0 0 0 1px var(--accent);
		outline: none;
	}
	main.narrow,
	main.narrow.open {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
		position: relative;
	}
	main.narrow .panel-slot {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		transition: height var(--duration-fast);
		z-index: var(--z-sheet);
		border-top: 1px solid var(--line);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		overflow: hidden;
		box-shadow: var(--shadow-sheet);
	}
	main.narrow .panel-slot.dragging {
		transition: none;
	}
	main.narrow .panel-slot :global(.panel) {
		flex: 1;
		min-height: 0;
		height: auto;
	}
	.grip {
		flex: none;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 24px;
		padding: 0;
		border: none;
		background: var(--bg-raised);
		cursor: ns-resize;
		touch-action: none;
	}
	.grip:focus-visible {
		outline-offset: -2px;
	}
	.bar {
		width: 40px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--fg-faint);
	}
</style>
