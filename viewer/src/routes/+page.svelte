<script lang="ts">
	import Toolbar from '#lib/components/organisms/Toolbar.svelte';
	import Timeline from '#lib/components/organisms/Timeline.svelte';
	import DetailPanel from '#lib/components/organisms/DetailPanel.svelte';
	import CommandPalette from '#lib/components/organisms/CommandPalette.svelte';
	import PathFinder from '#lib/components/organisms/PathFinder.svelte';
	import FocusBar from '#lib/components/organisms/FocusBar.svelte';
	import { viewer } from '#lib/viewer.svelte.ts';
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
		}}>Skip to timeline</a
	>
	<Toolbar />
	<FocusBar />
	<main class:narrow={viewer.narrow.current} class:open={viewer.panelOpen} style:--panel-w={viewer.panelWidth ? `${viewer.panelWidth}px` : null}>
		<Timeline />
		{#if viewer.panelOpen}
			<div class="panel-slot">
				{#if !viewer.narrow.current}
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
		height: 50%;
		z-index: var(--z-sheet);
		border-top: 1px solid var(--line);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		overflow: hidden;
		box-shadow: var(--shadow-sheet);
	}
</style>
