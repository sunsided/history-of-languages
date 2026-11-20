<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		/** default: bordered; pill: rounded toggle; tag: concept chip (pressed = highlighted); quiet: borderless; link: inline text link */
		variant?: 'default' | 'pill' | 'tag' | 'quiet' | 'link';
		children: Snippet;
	}

	let { variant = 'default', class: cls, children, type = 'button', ...rest }: Props = $props();
</script>

<button {type} class={['btn', variant, cls]} {...rest}>{@render children()}</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		padding: 0 var(--space-3);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.btn:hover {
		background: var(--hover);
	}
	.btn[aria-pressed='true'],
	.btn[aria-expanded='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.pill,
	.tag {
		border-radius: var(--radius-pill);
		padding: 0 var(--space-4);
	}
	.tag[aria-pressed='true'] {
		background: var(--warn);
		border-color: var(--warn);
		color: var(--bg);
	}
	.quiet {
		border-color: transparent;
		background: none;
		color: var(--fg-muted);
	}
	.quiet:hover {
		color: var(--fg);
	}
	.link {
		display: inline;
		min-height: 0;
		padding: 0;
		border: none;
		background: none;
		font-size: inherit;
		color: var(--accent);
		text-align: left;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}
	.link:hover {
		background: none;
		text-decoration-thickness: 2px;
	}
</style>
