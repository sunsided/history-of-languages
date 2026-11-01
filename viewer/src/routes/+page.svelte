<script lang="ts">
	import Toolbar from '#lib/components/Toolbar.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import DetailPanel from '#lib/components/DetailPanel.svelte';
	import CommandPalette from '#lib/components/CommandPalette.svelte';
	import { viewer } from '#lib/viewer.svelte.ts';
	import '../app.css';

	// Folded by default. Wide: opens as a right column. Narrow: opens as a bottom sheet over the timeline.
</script>

<svelte:head>
	<title>History of languages</title>
</svelte:head>

<div class="app">
	<Toolbar />
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

<style>
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
		z-index: 20;
		border-top: 1px solid var(--line);
		border-radius: 12px 12px 0 0;
		overflow: hidden;
		box-shadow: 0 -8px 28px rgb(0 0 0 / 0.22);
	}
</style>
