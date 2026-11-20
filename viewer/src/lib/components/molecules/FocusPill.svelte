<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from '../atoms/IconButton.svelte';

	interface Props {
		/** what is focused, for the remove button's name ("Remove Fortran") */
		label: string;
		onremove: () => void;
		children: Snippet;
	}

	let { label, onremove, children }: Props = $props();
</script>

<li class="pill">
	<span class="text">{@render children()}</span>
	<IconButton label="Remove {label}" onclick={onremove}>×</IconButton>
</li>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		padding-left: var(--space-4);
		border: 1px solid var(--accent);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	.text {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 28ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pill :global(.icon-btn) {
		border-radius: var(--radius-pill);
		font-size: var(--text-base);
	}
</style>
