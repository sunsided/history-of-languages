<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** referenced by the trigger's `popovertarget` */
		id: string;
		/** accessible name */
		label: string;
		children: Snippet;
	}

	let { id, label, children }: Props = $props();
</script>

<!-- Native popover: top layer, light dismiss, Esc, and focus back to the trigger for free.
     The trigger is a <button popovertarget={id}>, which also exposes aria-expanded. -->
<div {id} popover="auto" class="popover" role="dialog" aria-label={label}>
	{@render children()}
</div>

<style>
	.popover {
		inset: 52px var(--space-5) auto auto;
		margin: 0;
		width: min(560px, calc(100vw - 24px));
		max-height: calc(100dvh - 64px);
		overflow: auto;
		padding: var(--space-5);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-popover);
		font-size: var(--text-sm);
	}
	@media (max-width: 899px) {
		/* a full-screen sheet on phones */
		.popover {
			inset: 0;
			width: 100%;
			max-height: none;
			height: 100dvh;
			border-radius: 0;
			border: none;
		}
	}
</style>
