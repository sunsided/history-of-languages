<script lang="ts">
	let { family }: { family: string } = $props();
</script>

<span class="key line fam-{family}" aria-hidden="true"></span>

<style>
	.line {
		flex: none;
		width: 14px;
		height: 4px;
		border-radius: 2px;
		background: var(--fam, var(--fg-muted));
	}
</style>
