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
	<main class:narrow={viewer.narrow.current} class:open={viewer.panelOpen}>
		<Timeline />
		{#if viewer.panelOpen}
			<div class="panel-slot">
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
		grid-template-columns: minmax(0, 1fr) clamp(300px, 28vw, 420px);
	}
	.panel-slot {
		min-height: 0;
		min-width: 0;
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
