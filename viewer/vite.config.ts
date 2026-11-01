import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { dataset } from './vite/dataset.ts';

// `yarn build` makes two builds of the same app:
//  - build/         the default split build (hashed ES-module chunks, cached across visits);
//  - build/static/  BUNDLE=inline: one index.html with the whole app in a classic <script>.
// The Wayback Machine serves ES modules rewritten as classic scripts (wrapped in a block), so the split
// build stays blank there. The split page links to ./static/ so crawlers archive it, and a small inline
// script in app.html sends archive visitors to it. The static copy uses the split build's photos (../).
const inline = process.env.BUNDLE === 'inline';

// BASE_PATH is set by the GitHub Pages workflow (e.g. /history-of-languages); empty for local use.
const root = (process.env.BASE_PATH ?? '').replace(/\/$/, '');
const base = (inline ? `${root}/static` : root) as '' | `/${string}`;


export default defineConfig(({ command }) => ({
	plugins: [
		dataset({ dataDir: '../data', emitMedia: !inline }),
		sveltekit({
			adapter: adapter({ pages: inline ? 'build/static' : 'build' }),
			paths: { base },
			output: { bundleStrategy: inline ? 'inline' : 'split' },
			// one page; don't follow the link to the single-file copy, which this build doesn't contain
			prerender: { crawl: false }
		})
	],
	define: {
		__MEDIA_PREFIX__: JSON.stringify(inline ? '../' : ''),
		// fills %hol.static-copy% in app.html (src/hooks.server.ts): only the split build links to the copy
		__STATIC_COPY__: JSON.stringify(command === 'build' && !inline ? './static/' : '')
	},
	server: { port: 5173 }
}));
