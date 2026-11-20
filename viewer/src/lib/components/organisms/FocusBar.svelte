<script lang="ts">
	import { viewer } from '#lib/viewer.svelte.ts';
	import Button from '../atoms/Button.svelte';
	import KindDot from '../atoms/KindDot.svelte';
	import ToggleChip from '../atoms/ToggleChip.svelte';
	import FocusPill from '../molecules/FocusPill.svelte';

	// One pill per active focus, so it is visible why the timeline is dimmed and each layer can be dropped.
	const g = $derived(viewer.graph);
	const node = $derived(viewer.selected?.type === 'node' ? g.node.get(viewer.selected.id) : undefined);
	const cluster = $derived(viewer.selected?.type === 'cluster' ? g.clusters.get(viewer.selected.id)?.cluster : undefined);
	const concept = $derived(viewer.concept ? g.concept.get(viewer.concept) : undefined);
	const lineage = $derived(viewer.lineage ? g.data.lineages.find((l) => l.id === viewer.lineage) : undefined);
	const step = $derived(
		viewer.stepNodes.length ? lineage?.steps.find((s) => s.nodes?.join() === viewer.stepNodes.join()) : undefined
	);
	const active = $derived(!!(node || cluster || concept || lineage));
</script>

{#if active}
	<section class="focus-bar" aria-label="Active highlights">
		<span class="title" aria-hidden="true">Focus</span>
		<ul>
			{#if node}
				<FocusPill label={node.name} onremove={() => viewer.deselect()}><KindDot kind={node.kind} />{node.name}</FocusPill>
			{:else if cluster}
				<FocusPill label={cluster.name} onremove={() => viewer.deselect()}>cluster: {cluster.name}</FocusPill>
			{/if}
			{#if concept}
				<FocusPill label="concept {concept.name}" onremove={() => viewer.setConcept(null)}><span aria-hidden="true">◆</span> {concept.name}</FocusPill>
			{/if}
			{#if lineage}
				<FocusPill label="lineage {lineage.title}" onremove={() => viewer.setLineage(null)}>lineage: {lineage.title}</FocusPill>
			{/if}
			{#if step}
				<FocusPill label="step {step.title}" onremove={() => (viewer.stepNodes = [])}>step: {step.title}</FocusPill>
			{/if}
		</ul>
		{#if node}
			<ToggleChip title="Follow edges transitively, or only one hop" checked={viewer.depth === 'full'} onchange={() => (viewer.depth = viewer.depth === 'full' ? 'direct' : 'full')}>transitive</ToggleChip>
		{/if}
		<Button variant="quiet" class="clear-all" onclick={() => viewer.clearFocus()} title="Clear selection and highlights (Esc peels one at a time)">Clear all</Button>
	</section>
{/if}

<style>
	.focus-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3) var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-5);
		border-bottom: 1px solid var(--line);
		background: var(--bg-raised);
		font-size: var(--text-sm);
	}
	.title {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.focus-bar :global(.clear-all) {
		margin-left: auto;
	}
	@media (max-width: 899px) {
		.focus-bar,
		ul {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding: var(--space-2) 10px;
		}
	}
</style>
