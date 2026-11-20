<script lang="ts">
	import type { Snippet } from 'svelte';
	import KindDot from './KindDot.svelte';
	import FamilyLine from './FamilyLine.svelte';

	interface Props {
		checked: boolean;
		onchange: () => void;
		title?: string;
		/** colour key: a node kind (dot) or an edge family (line) */
		kind?: string;
		family?: string;
		children: Snippet;
	}

	let { checked, onchange, title, kind, family, children }: Props = $props();
</script>

<!-- A real checkbox, visually hidden but focusable, so the chip works with keyboard and screen readers. -->
<label class="chip" {title}>
	<input class="sr-only" type="checkbox" {checked} {onchange} />
	{#if family}<FamilyLine {family} />{:else if kind}<KindDot {kind} />{/if}
	{@render children()}
</label>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-pill);
		background: var(--bg);
		font-size: var(--text-sm);
		cursor: pointer;
		user-select: none;
		position: relative;
	}
	.chip:hover {
		background: var(--hover);
	}
	.chip:has(:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	/* off: dashed outline, muted text, hollow key; still readable (no opacity fade) */
	.chip:has(input:not(:checked)) {
		border-style: dashed;
		background: none;
		color: var(--fg-muted);
	}
	.chip:has(input:not(:checked)) :global(.key) {
		background: none;
		box-shadow: inset 0 0 0 1.5px var(--fam, var(--kind));
	}
</style>
