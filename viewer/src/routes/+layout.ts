// Client-side only (uses localStorage, window sizes, HMR events). `prerender` makes the static build
// emit an index.html shell that loads the app; the dataset is bundled into the JS.
export const ssr = false;
export const prerender = true;
