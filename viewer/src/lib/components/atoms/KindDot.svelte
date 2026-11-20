<script lang="ts">
	let { kind, size = 8 }: { kind: string; size?: number } = $props();
</script>

<span class="key kind-dot kind-{kind}" style:--size="{size}px" aria-hidden="true"></span>

<style>
	.kind-dot {
		flex: none;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: var(--kind, var(--fg-faint));
	}
</style>
