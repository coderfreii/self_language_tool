import { Tracker } from './tracker';
import { DirtyLevels, setupTrackContext, trigger } from './system';
import { Dep } from './dep';

export function computed<T>(getter: (oldValue?: T) => T) {

	let oldValue: T | undefined;

	const tracker = new Tracker(
		() => trigger(dep, DirtyLevels.ComputedValueMaybeDirty)
	);
	const doComputeIfPossible = (): T => {
		setupTrackContext(dep);
		if (
			tracker.dirty  //这里第一次必走
			&& !Object.is(
				oldValue,
				oldValue = tracker.active(() => getter(oldValue))
			)
		) {
			trigger(dep, DirtyLevels.ComputedValueDirty);
		}
		return oldValue!;
	};
	const dep = new Dep(doComputeIfPossible);  //个数取决于在其它tracker内调用了几次当前fn  内容为

	return doComputeIfPossible;
}


// const c = computed((old?: number) => {
// 	return old || -1;
// });

// const c1 = computed((old1?: number) => {
// 	return old1 || -1;
// });

const c2 = computed((old2?: number) => {
	// c1();
	// c1();
	return old2 || -1;
});

const c3 = computed((old3?: number) => {
	c2();
	return old3 || -1;
});



c3()
c3()

