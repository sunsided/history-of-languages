<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** accessible name of the dialog */
		label: string;
		/** called on Esc, backdrop click or close(); the owner unmounts the dialog */
		onclose: () => void;
		width?: string;
		top?: string;
		maxHeight?: string;
		children: Snippet;
	}

	let { label, onclose, width = '640px', top = '12vh', maxHeight = '70vh', children }: Props = $props();

	// Native modal: the browser traps focus, makes the page inert and maps Esc to `close`.
	// Mount opens it; unmount closes it and hands focus back to whatever opened it.
	function modal(el: HTMLDialogElement) {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		el.showModal();
		el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
		return () => {
			if (el.open) el.close();
			opener?.focus();
		};
	}
</script>

<dialog
	{@attach modal}
	aria-label={label}
	style:--width={width}
	style:--top={top}
	style:--max-h={maxHeight}
	{onclose}
	onclick={(e) => e.target === e.currentTarget && onclose()}
>
	<div class="panel">{@render children()}</div>
</dialog>

<style>
	dialog {
		width: min(var(--width), calc(100% - 32px));
		max-width: none;
		max-height: none;
		margin: var(--top) auto auto;
		padding: 0;
		border: none;
		background: none;
		color: var(--fg);
		overflow: visible;
	}
	dialog::backdrop {
		background: var(--scrim);
	}
	.panel {
		display: flex;
		flex-direction: column;
		max-height: var(--max-h);
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-dialog);
		overflow: hidden;
	}
	@media (max-width: 899px) {
		dialog {
			width: calc(100% - 16px);
			margin-top: 8px;
		}
		.panel {
			max-height: calc(100dvh - 16px);
		}
	}
</style>
