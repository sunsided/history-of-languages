// Provided by vite/dataset.ts
declare module 'virtual:dataset' {
	const data: import('./lib/types.ts').Dataset;
	export default data;
}

declare module 'virtual:search-index' {
	const index: import('./lib/search.ts').SearchIndex;
	export default index;
}
