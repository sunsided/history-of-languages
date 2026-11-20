// Similarity map of the whole dataset: one sparse feature vector per node, then t-SNE (2D or 3D) or a
// self-organising map. Pure TS and seeded, so the same data always gives the same picture.
//
// A node's features: itself, its graph neighbours (any relation, either direction; 2 hops damped),
// its concept tags and milestone concepts, and its cluster path. Year is deliberately left out, so a
// time gradient on the map is something the relations produced, not something put in.

import type { Edge, LangNode } from './types.ts';

type Sparse = Map<string, number>;

/** the parts of a node the features read; small enough to post to a worker */
export type FeatureNode = Pick<LangNode, 'id' | 'cluster' | 'tags' | 'milestones'>;

export function features(nodes: FeatureNode[], edges: Pick<Edge, 'from' | 'to'>[]): { ids: string[]; vecs: Sparse[] } {
	const ids = nodes.map((n) => n.id);
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const nb = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
	for (const e of edges) {
		if (!nb.has(e.from) || !nb.has(e.to)) continue;
		nb.get(e.from)!.add(e.to);
		nb.get(e.to)!.add(e.from);
	}
	const vecs = ids.map((id) => {
		const n = byId.get(id)!;
		const v: Sparse = new Map();
		const add = (k: string, w: number) => v.set(k, Math.max(v.get(k) ?? 0, w));
		add(`n:${id}`, 1);
		for (const a of nb.get(id)!) {
			add(`n:${a}`, 1);
			for (const b of nb.get(a)!) if (b !== id) add(`n:${b}`, 0.3);
		}
		for (const list of Object.values(n.tags ?? {})) for (const c of list) add(`c:${c}`, 1);
		for (const m of n.milestones ?? []) for (const c of m.introduces ?? []) add(`c:${c}`, 0.7);
		const parts = n.cluster.split('/');
		parts.forEach((_, i) => add(`k:${parts.slice(0, i + 1).join('/')}`, 1));
		const norm = Math.hypot(...v.values());
		for (const [k, w] of v) v.set(k, w / norm);
		return v;
	});
	return { ids, vecs };
}

/** cosine distance, n x n, row-major */
export function distances(vecs: Sparse[]): Float64Array {
	const n = vecs.length;
	const D = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const [a, b] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
			let dot = 0;
			for (const [k, w] of a) dot += w * (b.get(k) ?? 0);
			D[i * n + j] = D[j * n + i] = Math.max(0, 1 - dot);
		}
	}
	return D;
}

/** mulberry32 */
export function rng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** symmetric t-SNE affinities from a distance matrix (binary search for each row's sigma) */
export function affinities(D: Float64Array, n: number, perplexity = 30): Float64Array {
	const P = new Float64Array(n * n);
	const target = Math.log(perplexity);
	const row = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let beta = 1, lo = 0, hi = Infinity;
		for (let it = 0; it < 64; it++) {
			let sum = 0, h = 0;
			for (let j = 0; j < n; j++) {
				const d = D[i * n + j] ** 2;
				row[j] = j === i ? 0 : Math.exp(-d * beta);
				sum += row[j];
				h += d * row[j];
			}
			sum ||= 1e-12;
			const entropy = Math.log(sum) + (beta * h) / sum;
			for (let j = 0; j < n; j++) row[j] /= sum;
			if (Math.abs(entropy - target) < 1e-5) break;
			if (entropy > target) (lo = beta), (beta = hi === Infinity ? beta * 2 : (beta + hi) / 2);
			else (hi = beta), (beta = (beta + lo) / 2);
		}
		P.set(row, i * n);
	}
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) {
			const p = Math.max((P[i * n + j] + P[j * n + i]) / (2 * n), 1e-12);
			P[i * n + j] = P[j * n + i] = p;
		}
	return P;
}

/** Exact t-SNE (n^2 per step; fine for ~1000 points). Call `step()` until `done`. */
export class TSNE {
	readonly Y: Float64Array;
	iter = 0;
	readonly total = 750;
	private gains: Float64Array;
	private vel: Float64Array;
	private Q: Float64Array;
	/** max(50, n / 12), as in openTSNE; a fixed 200 overshoots on small inputs */
	private lr: number;
	private P: Float64Array;
	readonly n: number;
	readonly dims: 2 | 3;

	constructor(P: Float64Array, n: number, dims: 2 | 3, seed = 1) {
		this.P = P;
		this.n = n;
		this.dims = dims;
		this.lr = Math.max(50, n / 12);
		const r = rng(seed);
		this.Y = Float64Array.from({ length: n * dims }, () => (r() - 0.5) * 1e-2);
		this.gains = new Float64Array(n * dims).fill(1);
		this.vel = new Float64Array(n * dims);
		this.Q = new Float64Array(n * n);
	}

	get done() {
		return this.iter >= this.total;
	}

	step() {
		const { n, dims, Y, P, Q } = this;
		const exag = this.iter < 250 ? 12 : 1;
		const mom = this.iter < 250 ? 0.5 : 0.8;
		let qsum = 0;
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++) {
				let d = 0;
				for (let k = 0; k < dims; k++) d += (Y[i * dims + k] - Y[j * dims + k]) ** 2;
				const q = 1 / (1 + d);
				Q[i * n + j] = Q[j * n + i] = q;
				qsum += 2 * q;
			}
		const grad = new Float64Array(n * dims);
		for (let i = 0; i < n; i++)
			for (let j = 0; j < n; j++) {
				if (i === j) continue;
				const q = Q[i * n + j];
				const m = 4 * (exag * P[i * n + j] - q / qsum) * q;
				for (let k = 0; k < dims; k++) grad[i * dims + k] += m * (Y[i * dims + k] - Y[j * dims + k]);
			}
		const mean = new Float64Array(dims);
		for (let x = 0; x < n * dims; x++) {
			const same = Math.sign(grad[x]) === Math.sign(this.vel[x]);
			this.gains[x] = Math.max(0.01, same ? this.gains[x] * 0.8 : this.gains[x] + 0.2);
			this.vel[x] = mom * this.vel[x] - this.lr * this.gains[x] * grad[x];
			Y[x] += this.vel[x];
			mean[x % dims] += Y[x] / n;
		}
		for (let x = 0; x < n * dims; x++) Y[x] -= mean[x % dims];
		this.iter++;
	}
}

/** Johnson-Lindenstrauss: sparse vectors to `dims` dense ones, seeded random signs per feature key */
function project(vecs: Sparse[], dims: number, seed: number): Float64Array[] {
	const keyRow = new Map<string, Float64Array>();
	const r = rng(seed);
	return vecs.map((v) => {
		const out = new Float64Array(dims);
		for (const [k, w] of v) {
			let row = keyRow.get(k);
			if (!row) keyRow.set(k, (row = Float64Array.from({ length: dims }, () => (r() < 0.5 ? -1 : 1) / Math.sqrt(dims))));
			for (let d = 0; d < dims; d++) out[d] += w * row[d];
		}
		return out;
	});
}

export interface SOM {
	cols: number;
	rows: number;
	/** best-matching cell per input, as row * cols + col */
	cell: Int32Array;
	/** per cell: mean distance to neighbouring prototypes (the U-matrix), as a rank from 0 (smoothest) to 1 */
	umatrix: Float64Array;
}

/** Batch self-organising map on a cols x rows grid; neighbourhood radius shrinks over `epochs`. */
export function som(vecs: Sparse[], cols = 24, rows = 16, epochs = 30, seed = 1): SOM {
	const dims = 64;
	const X = project(vecs, dims, seed);
	const units = cols * rows;
	const r = rng(seed + 1);
	// start prototypes at random inputs, so empty space isn't a big grey blob
	const W = Array.from({ length: units }, () => Float64Array.from(X[Math.floor(r() * X.length)]));
	const cell = new Int32Array(X.length);
	const dist2 = (a: Float64Array, b: Float64Array) => {
		let s = 0;
		for (let d = 0; d < dims; d++) s += (a[d] - b[d]) ** 2;
		return s;
	};
	const bmu = (x: Float64Array) => {
		let best = 0, bd = Infinity;
		for (let u = 0; u < units; u++) {
			const d = dist2(x, W[u]);
			if (d < bd) (bd = d), (best = u);
		}
		return best;
	};
	for (let ep = 0; ep < epochs; ep++) {
		const sigma = Math.max(0.6, (Math.max(cols, rows) / 2) * (1 - ep / epochs));
		const sum = Array.from({ length: units }, () => new Float64Array(dims));
		const cnt = new Float64Array(units);
		X.forEach((x, i) => {
			const b = (cell[i] = bmu(x));
			cnt[b]++;
			for (let d = 0; d < dims; d++) sum[b][d] += x[d];
		});
		for (let u = 0; u < units; u++) {
			const ux = u % cols, uy = Math.floor(u / cols);
			const acc = new Float64Array(dims);
			let wsum = 0;
			for (let v = 0; v < units; v++) {
				if (!cnt[v]) continue;
				const h = Math.exp(-((ux - (v % cols)) ** 2 + (uy - Math.floor(v / cols)) ** 2) / (2 * sigma * sigma));
				if (h < 1e-4) continue;
				wsum += h * cnt[v];
				for (let d = 0; d < dims; d++) acc[d] += h * sum[v][d];
			}
			if (wsum) for (let d = 0; d < dims; d++) W[u][d] = acc[d] / wsum;
		}
	}
	X.forEach((x, i) => (cell[i] = bmu(x)));
	const umatrix = new Float64Array(units);
	for (let u = 0; u < units; u++) {
		const ux = u % cols, uy = Math.floor(u / cols);
		const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [ux + dx, uy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows);
		umatrix[u] = nbs.reduce((s, [x, y]) => s + Math.sqrt(dist2(W[u], W[y * cols + x])), 0) / nbs.length;
	}
	// rank, not min-max: a few extreme borders would otherwise squeeze every other cell into mid-grey
	const order = [...umatrix.keys()].sort((a, b) => umatrix[a] - umatrix[b]);
	order.forEach((u, k) => (umatrix[u] = k / (units - 1)));
	return { cols, rows, cell, umatrix };
}
