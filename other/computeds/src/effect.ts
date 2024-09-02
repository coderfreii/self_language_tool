import { Tracker } from './tracker';

export function effect(fn: () => void): Tracker {

	const tracker = new Tracker(
		() => { },
		() => {
			if (tracker.dirty) {
				tracker.active(fn);
			}
		});
	tracker.active(fn);

	return tracker;
}
