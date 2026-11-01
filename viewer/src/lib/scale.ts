// Piecewise-linear time axis. Antiquity to 1800 is squeezed, the computer age gets most of the width.

export const NOW = new Date().getFullYear();

interface Segment {
	from: number;
	to: number;
	/** pixels per year at zoom 1 */
	ppy: number;
}

const SEGMENTS: Segment[] = [
	{ from: -320, to: 1800, ppy: 0.12 },
	{ from: 1800, to: 1935, ppy: 2 },
	{ from: 1935, to: NOW + 3, ppy: 16 }
];

export const PAD = 24;

export interface TimeScale {
	x(year: number): number;
	year(x: number): number;
	width: number;
	ticks(): { year: number; major: boolean }[];
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000];

export function timeScale(zoom: number): TimeScale {
	const offsets: number[] = [];
	let acc = PAD;
	for (const s of SEGMENTS) {
		offsets.push(acc);
		acc += (s.to - s.from) * s.ppy * zoom;
	}
	const width = acc + PAD;

	const x = (year: number) => {
		const last = SEGMENTS.length - 1;
		for (let i = 0; i <= last; i++) {
			const s = SEGMENTS[i];
			if (year <= s.to || i === last) {
				const y = i === 0 ? year : Math.max(year, s.from);
				return offsets[i] + (y - s.from) * s.ppy * zoom;
			}
		}
		return width;
	};

	const year = (px: number) => {
		for (let i = SEGMENTS.length - 1; i >= 0; i--) {
			if (px >= offsets[i] || i === 0) return SEGMENTS[i].from + (px - offsets[i]) / (SEGMENTS[i].ppy * zoom);
		}
		return SEGMENTS[0].from;
	};

	const ticks = () => {
		const out: { year: number; major: boolean }[] = [];
		for (const s of SEGMENTS) {
			const ppy = s.ppy * zoom;
			const step = STEPS.find((st) => st * ppy >= 46) ?? 1000;
			const major = STEPS.find((st) => st >= step * 4 && st % step === 0) ?? step * 5;
			const start = Math.ceil(s.from / step) * step;
			for (let y = start; y < s.to; y += step) {
				// segment joins: drop a tick that would collide with the previous one
				const prev = out.at(-1);
				if (prev && x(y) - x(prev.year) < 34) continue;
				out.push({ year: y, major: y % major === 0 });
			}
		}
		return out;
	};

	return { x, year, width, ticks };
}
