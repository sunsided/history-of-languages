import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { dataset } from './vite/dataset.ts';

// bundleStrategy 'inline' puts the whole app into one classic <script> in index.html. The default split
// build boots through import() of ES modules, which the Wayback Machine serves rewritten as classic
// scripts (wrapped in a block), so archived copies stayed blank.
// BASE_PATH is set by the GitHub Pages workflow (e.g. /history-of-languages); empty for local use.
const base = (process.env.BASE_PATH ?? '').replace(/\/$/, '') as '' | `/${string}`;

export default defineConfig({
	plugins: [dataset({ dataDir: '../data' }), sveltekit({ adapter: adapter(), paths: { base }, output: { bundleStrategy: 'inline' } })],
	server: { port: 5173 }
});
