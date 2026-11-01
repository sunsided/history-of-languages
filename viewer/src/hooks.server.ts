import type { Handle } from '@sveltejs/kit/hooks';

// Runs at prerender time: points app.html's archive redirect and hidden link at the single-file copy
// (see vite.config.ts). Empty in dev and in the copy itself, which disables both.
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => html.replaceAll('%hol.static-copy%', __STATIC_COPY__) });
