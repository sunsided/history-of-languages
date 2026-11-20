<script lang="ts">
	import IconButton from '../atoms/IconButton.svelte';
	import Button from '../atoms/Button.svelte';

	interface Props {
		level: number;
		hint: string;
		onzoomin: () => void;
		onzoomout: () => void;
		onfit: () => void;
		onnow: () => void;
	}

	let { level, hint, onzoomin, onzoomout, onfit, onnow }: Props = $props();
</script>

<div class="zoom" role="group" aria-label="Zoom and position" title={hint}>
	<IconButton variant="bordered" label="Zoom out" onclick={onzoomout}>−</IconButton>
	<Button onclick={onfit} title="Fit the whole timeline ({level.toFixed(2)}×)">Fit</Button>
	<IconButton variant="bordered" label="Zoom in" onclick={onzoomin}>+</IconButton>
	<Button onclick={onnow} title="Scroll to the present">Now →</Button>
	<output class="sr-only">zoom {level.toFixed(2)}×</output>
</div>

<style>
	.zoom {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border-bottom: 1px solid var(--line);
		border-left: 1px solid var(--line);
	}
</style>
