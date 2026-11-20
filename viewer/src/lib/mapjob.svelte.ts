// Pre-cooks the similarity map in a worker once the page is idle, so the Map view usually opens on a
// finished layout. Restarts on every data push (dev live reload).

import EmbedWorker from './embed.worker.ts?worker&inline';
import type { FromWorker, ToWorker } from './embed.worker.ts';
import type { SOM } from './embed.ts';
import { viewer, type MapMethod } from './viewer.svelte.ts';

export interface MapResult {
	ids: string[];
	Y?: Float64Array;
	som?: SOM;
}

class MapJob {
	result = $state.raw<Partial<Record<MapMethod, MapResult>>>({});
	/** 0..1 per method while cooking */
	progress = $state<Partial<Record<MapMethod, number>>>({});
	private worker: Worker | null = null;
	private wanted: MapMethod | null = null;
	/** the dataset the running worker was given */
	private forData: unknown = null;

	/** (re)start unless the worker already has the current data */
	start() {
		if (this.worker && this.forData === viewer.data) return;
		this.forData = viewer.data;
		this.worker?.terminate();
		this.result = {};
		this.progress = {};
		const w = (this.worker = new EmbedWorker());
		w.onmessage = (ev: MessageEvent<FromWorker>) => {
			const m = ev.data;
			if (m.type === 'progress') this.progress[m.method] = m.done;
			else {
				this.result = { ...this.result, [m.method]: { ids: m.ids, Y: m.Y, som: m.som } };
				delete this.progress[m.method];
			}
		};
		const msg: ToWorker = {
			type: 'data',
			nodes: viewer.data.nodes.map(({ id, cluster, tags, milestones }) => ({ id, cluster, tags, milestones })),
			edges: viewer.data.edges.map(({ from, to }) => ({ from, to }))
		};
		w.postMessage($state.snapshot(msg));
		if (this.wanted) w.postMessage({ type: 'prioritize', method: this.wanted } satisfies ToWorker);
	}

	/** the Map view is showing this method: cook it next */
	prioritize(method: MapMethod) {
		this.wanted = method;
		this.start();
		this.worker!.postMessage({ type: 'prioritize', method } satisfies ToWorker);
	}
}

export const mapJob = new MapJob();

if (typeof window !== 'undefined') {
	$effect.root(() => {
		$effect(() => {
			viewer.data; // restart on every data push
			const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
			const id = idle(() => mapJob.start(), { timeout: 4000 });
			return () => (window.cancelIdleCallback ?? clearTimeout)(id);
		});
	});
}
