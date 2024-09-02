import { Tracker } from './tracker';
import { DirtyLevels, collectOuterTrackerContext, trigger } from './system';
import { Dep } from './dep';
// import { signal } from './signal';

export function computed<T>(getterForTrackerActive: (oldValue?: T) => T) {

	let oldValue: T | undefined;

	const tracker = new Tracker(
		() => trigger(outerTrackers, DirtyLevels.ComputedValueMaybeDirty)
	);
	const doComputeIfPossible = (): T => {
		collectOuterTrackerContext(outerTrackers);
		if (
			tracker.dirty  //这里第一次必true 即tracker必active
			&& !Object.is(
				oldValue,
				oldValue = tracker.active(() => getterForTrackerActive(oldValue))
			)
		) {
			trigger(outerTrackers, DirtyLevels.ComputedValueDirty);
		}
		return oldValue!;
	};
	const outerTrackers = new Dep(doComputeIfPossible);  //个数取决于在不同的外层tracke的active内调用了几次当前doComputeIfPossible

	return doComputeIfPossible;
}


// const c = computed((old?: number) => {
// 	return old || -1;
// });

// const c1 = computed((old1?: number) => {
// 	c()
// 	return old1 || -1;
// });

// const c2 = computed((old2?: number) => {
// 	c1()
// 	return old2 || -1;
// });

// const s1 = signal(true);

// const c3 = computed((old3?: boolean) => {
// 	s1()
// 	c2()
// 	s1
// 	return !!!old3;
// });



// console.log(c3());
// s1.set(false)
// console.log(c3());
// console.log();



