import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { dataset } from './vite/dataset.ts';

export default defineConfig({
	plugins: [dataset({ dataDir: '../data' }), sveltekit()],
	server: { port: 5173 }
});
