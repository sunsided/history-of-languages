import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { dataset } from './vite/dataset.ts';

// BASE_PATH is set by the GitHub Pages workflow (e.g. /history-of-languages); empty for local use.
const base = (process.env.BASE_PATH ?? '').replace(/\/$/, '') as '' | `/${string}`;

export default defineConfig({
	plugins: [dataset({ dataDir: '../data' }), sveltekit({ adapter: adapter(), paths: { base } })],
	server: { port: 5173 }
});
