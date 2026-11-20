<script lang="ts">
	import type { Snippet } from 'svelte';
	let { legend, children }: { legend: string; children: Snippet } = $props();
</script>

<fieldset>
	<legend>{legend}</legend>
	{@render children()}
</fieldset>

<style>
	fieldset {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		float: left;
		padding: 0 var(--space-2) 0 0;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
	}
	@media (max-width: 899px) {
		fieldset {
			flex-wrap: wrap;
		}
	}
</style>
