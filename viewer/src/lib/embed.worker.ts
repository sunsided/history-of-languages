// Cooks the similarity map off the main thread: all three layouts, one after the other, the one the
// user is looking at first. Each job is a generator, so a `prioritize` message can switch jobs between
// chunks without losing the half-finished one.

import { TSNE, affinities, distances, features, som, type FeatureNode, type SOM } from './embed.ts';
import type { MapMethod } from './viewer.svelte.ts';

export type ToWorker = { type: 'data'; nodes: FeatureNode[]; edges: { from: string; to: string }[] } | { type: 'prioritize'; method: MapMethod };
export type FromWorker =
	| { type: 'progress'; method: MapMethod; done: number }
	| { type: 'result'; method: MapMethod; ids: string[]; Y?: Float64Array; som?: SOM };

const post = (m: FromWorker) => postMessage(m);

let queue: { method: MapMethod; job: Generator<number, void> }[] = [];
let running = false;

function plan(nodes: FeatureNode[], edges: { from: string; to: string }[]) {
	let prep: ReturnType<typeof features> | undefined;
	let P: Float64Array | undefined;
	const getPrep = () => (prep ??= features(nodes, edges));

	function* tsne(method: 'tsne2' | 'tsne3'): Generator<number, void> {
		const { ids, vecs } = getPrep();
		P ??= affinities(distances(vecs), ids.length);
		const t = new TSNE(P, ids.length, method === 'tsne3' ? 3 : 2);
		while (!t.done) {
			t.step();
			if (t.iter % 10 === 0) yield t.iter / t.total;
		}
		post({ type: 'result', method, ids, Y: t.Y });
	}
	function* map(): Generator<number, void> {
		const { ids, vecs } = getPrep();
		yield 0.5;
		post({ type: 'result', method: 'som', ids, som: som(vecs) });
	}
	return [
		{ method: 'tsne2' as const, job: tsne('tsne2') },
		{ method: 'som' as const, job: map() },
		{ method: 'tsne3' as const, job: tsne('tsne3') }
	];
}

async function run() {
	if (running) return;
	running = true;
	while (queue.length) {
		const { method, job } = queue[0];
		const end = performance.now() + 50;
		let r = job.next();
		while (!r.done && performance.now() < end) r = job.next();
		if (r.done) queue.shift();
		else post({ type: 'progress', method, done: r.value });
		// yield, so a prioritize or new-data message can land between chunks
		await new Promise((res) => setTimeout(res));
	}
	running = false;
}

onmessage = (ev: MessageEvent<ToWorker>) => {
	const m = ev.data;
	if (m.type === 'data') queue = plan(m.nodes, m.edges);
	else {
		const i = queue.findIndex((j) => j.method === m.method);
		if (i > 0) queue.unshift(...queue.splice(i, 1));
	}
	run();
};
