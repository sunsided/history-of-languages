<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLButtonAttributes, 'aria-label'> {
		/** accessible name; also the tooltip unless `title` adds e.g. a shortcut */
		label: string;
		/** bordered (toolbar) or bare (close buttons) */
		variant?: 'bordered' | 'bare';
		children: Snippet;
	}

	let { label, title, variant = 'bare', class: cls, children, type = 'button', ...rest }: Props = $props();
</script>

<button {type} class={['icon-btn', variant, cls]} aria-label={label} title={title ?? label} {...rest}>
	<span aria-hidden="true">{@render children()}</span>
</button>

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--target-min);
		min-height: var(--target-min);
		padding: 0 var(--space-2);
		font: inherit;
		font-size: var(--text-lg);
		line-height: 1;
		color: var(--fg-muted);
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.icon-btn:hover {
		color: var(--fg);
		background: var(--hover);
	}
	.bordered {
		font-size: var(--text-sm);
		color: var(--fg);
		background: var(--bg);
		border-color: var(--line);
	}
	.icon-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
