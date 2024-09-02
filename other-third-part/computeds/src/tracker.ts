import { DirtyLevels, activeTrackersInCurrentCallStack, cleanupDepEffect, outerTrackerDepsMap, pauseTracking, resetTracking } from './system';

export type TrackToken = WeakRef<Tracker> | Tracker;

export class Tracker {

	trackToken?: TrackToken;
	dirtyLevel = DirtyLevels.Dirty;
	activeNo = 0;  //表明第几次active
	runnings = 0;
	checkingDirty = 0;
	depsLength = 0;

	constructor(
		public spreadUp: () => void,
		public effect?: () => void,
	) { }


	setDirtyLevel(dirtyLevel:DirtyLevels){
		this.dirtyLevel = dirtyLevel
	}

	get dirty() {
		if (this.dirtyLevel === DirtyLevels.ComputedValueMaybeDirty) {   //excute after trigger whith ComputedValueMaybeDirty
			this.setDirtyLevel( DirtyLevels.NotDirty)
			if (this.trackToken) {
				const deps = outerTrackerDepsMap.get(this.trackToken);
				if (deps) {
					this.checkingDirty++;
					pauseTracking();
					for (const dep of deps) {
						if (dep.computed) {
							dep.computed();
							if (this.dirtyLevel >= DirtyLevels.ComputedValueDirty) {
								break;
							}
						}
					}
					resetTracking();
					this.checkingDirty--;
				}
			}
		}
		return this.dirtyLevel >= DirtyLevels.ComputedValueDirty;
	}

	active<T>(fn: () => T): T {
		try {
			activeTrackersInCurrentCallStack.push(this);
			this.runnings++;
			preCleanup(this);
			return fn();
		} finally {
			postCleanup(this);
			this.runnings--;
			activeTrackersInCurrentCallStack.pop();
			if (!this.runnings) {
				this.setDirtyLevel(DirtyLevels.NotDirty)
			}
		}
	}

	reset() {
		preCleanup(this);
		postCleanup(this);
		this.setDirtyLevel(DirtyLevels.Dirty)
	}

	deref() {
		return this;
	}
}

function preCleanup(tracker: Tracker) {
	tracker.activeNo++;    //active次数加一
	tracker.depsLength = 0;
}

function postCleanup(tracker: Tracker) {
	if (tracker.trackToken) {
		const deps = outerTrackerDepsMap.get(tracker.trackToken);
		if (deps && deps.length > tracker.depsLength) {
			for (let i = tracker.depsLength; i < deps.length; i++) {
				cleanupDepEffect(deps[i], tracker);
			}
			deps.length = tracker.depsLength;
		}
	}
}
