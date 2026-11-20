<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<kbd>{@render children()}</kbd>

<style>
	kbd {
		font-family: var(--mono);
		font-size: var(--text-2xs);
		padding: 0 var(--space-2);
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--fg-muted);
	}
</style>
