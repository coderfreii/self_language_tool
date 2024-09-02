import type { Dep } from './dep';
import type { Tracker, TrackToken } from './tracker';

export const enum DirtyLevels {
	NotDirty = 0,
	ComputedValueMaybeDirty = 1,
	ComputedValueDirty = 2,
	Dirty = 3
}

let _activeTrackersInCurrentCallStack: Tracker[] = [];

let pauseEffectStack = 0;

const pausedTrackers: Tracker[][] = [];
const _pausedEffects: Tracker[] = [];


const pausedEffects = {
	push(item: Tracker) {
		return _pausedEffects.push(item);
	},
	pop() {
		return _pausedEffects.pop();
	},
	get length(){
		return _pausedEffects.length
	},
	shift(){
		return _pausedEffects.shift()
	}
}


export const activeTrackersInCurrentCallStack = {
	push(item: Tracker) {
		return _activeTrackersInCurrentCallStack.push(item);
	},
	pop() {
		return _activeTrackersInCurrentCallStack.pop();
	},
	shift(){
		return _activeTrackersInCurrentCallStack.shift()
	}
}

export function pauseTracking() {
	pausedTrackers.push(_activeTrackersInCurrentCallStack);
	_activeTrackersInCurrentCallStack = [];
}

export function resetTracking() {
	_activeTrackersInCurrentCallStack = pausedTrackers.pop()!;
}

export function pauseEffect() {
	pauseEffectStack++;
}

export function resetEffect() {
	pauseEffectStack--;
	while (!pauseEffectStack && pausedEffects.length) {
		pausedEffects.shift()!.effect!();
	}
}

export const trackerDepsMap = new WeakMap<TrackToken, Dep[]>();

const trackerRegistry = new FinalizationRegistry<WeakRef<Tracker>>(trackToken => {
	const deps = trackerDepsMap.get(trackToken);
	if (deps) {
		for (const dep of deps) {
			dep.delete(trackToken);
		}
		deps.length = 0;
	}
});


function getCurrentCallStackTopTracker() {
	if (_activeTrackersInCurrentCallStack.length) {
		const tracker = _activeTrackersInCurrentCallStack[_activeTrackersInCurrentCallStack.length - 1];
		if (!tracker.trackToken) {
			if (tracker.effect) {
				tracker.trackToken = tracker;
			} else {
				tracker.trackToken = new WeakRef(tracker);
				trackerRegistry.register(tracker, tracker.trackToken, tracker);
			}
			trackerDepsMap.set(tracker.trackToken, []);
		}

		return tracker;
	}
}


export function setupTrackContext(dep: Dep) {  
	const topTracker = getCurrentCallStackTopTracker();
	if (topTracker && topTracker.trackToken) {
		//
		const trackToken = topTracker.trackToken;
		const deps = trackerDepsMap.get(trackToken);  //获取当前激活的tracker的所有的下游依赖
		if (deps) {
			if (dep.get(topTracker) !== topTracker.trackId) {  //判断父tracker是否记录， 如果记录了判断是否是记录的那次active调用    父tracker active每次调用会导致 trackId不一样
				dep.set(topTracker, topTracker.trackId);   //将父tracker放进去
				const oldDep = deps[topTracker.depsLength];  //取最后一个依赖 跟当前不相等
				if (oldDep !== dep) {
					if (oldDep) {
						cleanupDepEffect(oldDep, topTracker);
					}
					deps[topTracker.depsLength++] = dep;   //放入当前tracker的依赖
				} else {
					topTracker.depsLength++;
				}
			}
		}
	}
}


export function cleanupDepEffect(dep: Dep, tracker: Tracker) {
	const trackId = dep.get(tracker);
	if (trackId !== undefined && tracker.trackId !== trackId) {
		dep.delete(tracker);
	}
}

export function trigger(dep: Dep, dirtyLevel: DirtyLevels) {
	pauseEffect();
	for (const trackToken of dep.keys()) {
		const tracker = trackToken.deref();
		if (!tracker) {
			continue;
		}
		if (
			tracker.dirtyLevel < dirtyLevel &&
			(!tracker.runnings || dirtyLevel !== DirtyLevels.ComputedValueDirty)
		) {
			const lastDirtyLevel = tracker.dirtyLevel;
			tracker.dirtyLevel = dirtyLevel;
			if (
				lastDirtyLevel === DirtyLevels.NotDirty &&
				(!tracker.queryings || dirtyLevel !== DirtyLevels.ComputedValueDirty)
			) {
				tracker.spread();
				if (tracker.effect) {
					pausedEffects.push(tracker);
				}
			}
		}
	}
	resetEffect();
}
