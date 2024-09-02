import type { TrackToken } from './tracker';

export class Dep extends Map<TrackToken, number>  {
	constructor(public computed?: () => void) {
		super();
	}

	set(key: TrackToken, value: number) {
		super.set(key, value)
		return this
	}
}
