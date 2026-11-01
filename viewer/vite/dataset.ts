// Vite plugin: loads ../data/**/*.yaml straight into a virtual module (`virtual:dataset`), builds the
// command-palette search index from it (`virtual:search-index`), and pushes a
// fresh copy to the browser whenever a data file changes, so the viewer updates without a page reload
// and without running tools/build.py first.
//
// This is a lenient loader, not a validator: broken YAML or dangling references are collected into
// `problems` and shown in the UI. Run `task data:build` for full JSON Schema validation.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Plugin, ViteDevServer } from 'vite';
import type { Cluster, Dataset, Edge, LangNode, MediaItem } from '../src/lib/types.ts';
import { buildSearchIndex } from '../src/lib/search.ts';

const VIRTUAL_ID = 'virtual:dataset';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
// Search index, built here in Node from the same load so the browser gets precomputed keys.
const INDEX_ID = 'virtual:search-index';
const RESOLVED_INDEX_ID = '\0' + INDEX_ID;
export const UPDATE_EVENT = 'dataset:update';

function readList<T>(file: string, problems: string[], root: string): T[] {
	if (!fs.existsSync(file)) return [];
	try {
		const parsed = parse(fs.readFileSync(file, 'utf8'));
		if (parsed == null) return [];
		if (!Array.isArray(parsed)) {
			problems.push(`${path.relative(root, file)}: top level is not a list`);
			return [];
		}
		return parsed as T[];
	} catch (e) {
		problems.push(`${path.relative(root, file)}: ${(e as Error).message.split('\n')[0]}`);
		return [];
	}
}

function readDir<T>(dir: string, problems: string[], root: string, onItem?: (it: T, file: string) => void): T[] {
	if (!fs.existsSync(dir)) return [];
	const out: T[] = [];
	for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
		for (const it of readList<T>(path.join(dir, f), problems, root)) {
			onItem?.(it, f);
			out.push(it);
		}
	}
	return out;
}

export function loadDataset(dataDir: string): Dataset {
	const root = path.dirname(dataDir);
	const problems: string[] = [];

	const nodes = readDir<LangNode>(path.join(dataDir, 'nodes'), problems, root, (n, f) => (n._file = f));
	const clusters = readList<Cluster>(path.join(dataDir, 'clusters.yaml'), problems, root);
	const dataset: Dataset = {
		eras: readList(path.join(dataDir, 'eras.yaml'), problems, root),
		clusters,
		concepts: readList(path.join(dataDir, 'concepts.yaml'), problems, root),
		nodes: [],
		edges: [],
		lineages: readDir(path.join(dataDir, 'lineages'), problems, root),
		claims: readList(path.join(dataDir, 'claims.yaml'), problems, root),
		sources: readList(path.join(dataDir, 'sources.yaml'), problems, root),
		media: [],
		problems,
		loadedAt: new Date().toISOString()
	};

	// Nodes without the bare minimum to place on a timeline are dropped (and reported).
	const nodeIds = new Set<string>();
	for (const n of nodes) {
		const year = n?.origin?.first_appeared?.year;
		if (!n?.id || typeof year !== 'number') {
			problems.push(`node ${n?.id ?? '?'} (${n?._file}): missing id or origin.first_appeared.year; skipped`);
			continue;
		}
		if (nodeIds.has(n.id)) {
			problems.push(`duplicate node id: ${n.id}`);
			continue;
		}
		nodeIds.add(n.id);
		dataset.nodes.push(n);
	}

	// Clusters: synthesize missing ones (referenced by a node, a parent pointer, or a path prefix).
	const clusterIds = new Set(clusters.map((c) => c.id));
	const ensureCluster = (id: string, why: string) => {
		if (clusterIds.has(id)) return;
		problems.push(`unknown cluster '${id}' (${why}); shown as placeholder`);
		clusterIds.add(id);
		const parent = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : undefined;
		clusters.push({ id, name: id.split('/').pop()!, parent, _synthetic: true });
		if (parent) ensureCluster(parent, `ancestor of ${id}`);
	};
	for (const n of dataset.nodes) ensureCluster(n.cluster ?? '(none)', `node ${n.id}`);
	for (const c of [...clusters]) {
		if (c.parent) ensureCluster(c.parent, `parent of ${c.id}`);
		const parts = c.id.split('/');
		for (let i = 1; i < parts.length; i++) ensureCluster(parts.slice(0, i).join('/'), `ancestor of ${c.id}`);
	}

	for (const n of dataset.nodes) {
		for (const r of n.relations ?? []) {
			if (!nodeIds.has(r.to)) {
				problems.push(`node ${n.id}: ${r.type} -> unknown node '${r.to}'`);
				continue;
			}
			dataset.edges.push({ ...r, from: n.id } satisfies Edge);
		}
	}

	// Media: keep entries whose file exists on disk (fetch_media.py may not have run yet), report the rest.
	const media = readList<MediaItem>(path.join(dataDir, 'media.yaml'), problems, root);
	let missing = 0;
	for (const m of media) {
		if (!m?.file?.startsWith('assets/media/')) {
			problems.push(`media ${m?.id ?? '?'}: file must live under assets/media/`);
			continue;
		}
		if (!fs.existsSync(path.join(root, m.file))) {
			missing++;
			continue;
		}
		for (const n of m.nodes ?? []) if (!nodeIds.has(n)) problems.push(`media ${m.id}: unknown node '${n}'`);
		dataset.media.push(m);
	}
	if (missing) problems.push(`${missing} media files not downloaded yet (run tools/fetch_media.py)`);

	return dataset;
}

const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml'
};

export function dataset(options: { dataDir: string }): Plugin {
	const dataDir = path.resolve(options.dataDir);

	return {
		name: 'hol-dataset',
		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_ID;
			if (id === INDEX_ID) return RESOLVED_INDEX_ID;
		},
		load(id) {
			if (id === RESOLVED_ID) return `export default ${JSON.stringify(loadDataset(dataDir))};`;
			if (id === RESOLVED_INDEX_ID) return `export default ${JSON.stringify(buildSearchIndex(loadDataset(dataDir)))};`;
		},
		configureServer(server: ViteDevServer) {
			// Serve ../assets/media/* at /assets/media/* (it lives outside the Vite root).
			const mediaDir = path.join(path.dirname(dataDir), 'assets', 'media');
			server.middlewares.use('/assets/media', (req, res, next) => {
				const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
				const file = path.resolve(mediaDir, name);
				const type = MIME[path.extname(file).toLowerCase()];
				if (!file.startsWith(mediaDir + path.sep) || !type || !fs.existsSync(file)) return next();
				res.setHeader('Content-Type', type);
				res.setHeader('Cache-Control', 'no-cache');
				fs.createReadStream(file).pipe(res);
			});
			server.watcher.add(dataDir);
			let timer: ReturnType<typeof setTimeout> | undefined;
			const onChange = (file: string) => {
				if (!file.startsWith(dataDir) || !file.endsWith('.yaml')) return;
				clearTimeout(timer);
				timer = setTimeout(() => {
					// Next full page load gets fresh data too.
					for (const env of Object.values(server.environments)) {
						for (const id of [RESOLVED_ID, RESOLVED_INDEX_ID]) {
							const mod = env.moduleGraph.getModuleById(id);
							if (mod) env.moduleGraph.invalidateModule(mod);
						}
					}
					const data = loadDataset(dataDir);
					const index = buildSearchIndex(data);
					server.environments.client.hot.send({ type: 'custom', event: UPDATE_EVENT, data: { data, index } });
					server.config.logger.info(
						`dataset reloaded (${path.relative(dataDir, file)}): ${data.nodes.length} nodes, ${data.edges.length} edges, ${data.problems.length} problems`,
						{ timestamp: true }
					);
				}, 80);
			};
			server.watcher.on('change', onChange);
			server.watcher.on('add', onChange);
			server.watcher.on('unlink', onChange);
		},
		generateBundle() {
			// Static build: ship the media files the dataset references next to the app, at the same
			// paths the dev middleware serves them from.
			if (this.environment.name !== 'client') return;
			const root = path.dirname(dataDir);
			for (const m of loadDataset(dataDir).media) {
				this.emitFile({ type: 'asset', fileName: m.file, source: fs.readFileSync(path.join(root, m.file)) });
			}
		},
		hotUpdate({ file }) {
			// Data files are handled above; stop Vite from doing anything else with them.
			if (file.startsWith(dataDir)) return [];
		}
	};
}
