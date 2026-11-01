// Provided by vite/dataset.ts
declare module 'virtual:dataset' {
	const data: import('./lib/types.ts').Dataset;
	export default data;
}

declare module 'virtual:search-index' {
	const index: import('./lib/search.ts').SearchIndex;
	export default index;
}

/** Path prefix for media files: '' in dev and the main build, '../' in the single-file copy (vite.config.ts). */
declare const __MEDIA_PREFIX__: string;
/** './static/' in the split build, '' in dev and in the single-file copy (vite.config.ts). */
declare const __STATIC_COPY__: string;
