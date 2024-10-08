import { createLanguage } from '@volar/language-core';
import type { Language, LanguagePlugin } from '@volar/language-core/lib/types.js';
import type { LanguageServiceEnvironment, LanguageServicePlugin } from '@volar/language-service/lib/types.js';

import { createLanguageService as _createLanguageService } from '@volar/language-service/lib/languageService.js';
import { createUriMap } from '@volar/language-service/lib/utils/uriMap.js';
// import {
// 	LanguageServicePlugin,
// 	createLanguageService as _createLanguageService,
// 	createLanguage,
// 	createUriMap,
// 	type LanguageService,
// 	type LanguageServiceEnvironment,
// } from '@volar/language-service';
import { createTsLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';
import type { LanguageService } from '@volar/language-service/lib/languageService.js';

export * from '@volar/language-service';
export * from './lib/ata.js';

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

export function createSimpleWorkerService<T = {}>({
	env,
	workerContext,
	languagePlugins = [],
	servicePlugins = [],
	extraApis = {} as T,
}: {
	env: LanguageServiceEnvironment;
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins?: LanguagePlugin<URI>[];
	servicePlugins?: LanguageServicePlugin[];
	extraApis?: T;
}) {
	const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const language = createLanguage<URI>(
		languagePlugins,
		false,
		{
			getScriptSnapshot(uri) {
				const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
				if (model) {
					const cache = snapshots.get(model);
					if (cache && cache[0] === model.version) {
						return {};
					}
					const text = model.getValue();
					const snapshot: ts.IScriptSnapshot = {
						getText: (start, end) => text.substring(start, end),
						getLength: () => text.length,
						getChangeRange: () => undefined,
					};
					snapshots.set(model, [model.version, snapshot]);
					language.scripts.set(uri, snapshot);

					return {
						snapshot
					};
				}
				return {};
			},
		}
	);

	return createWorkerService(language, servicePlugins, env, extraApis);
}

export function createTypeScriptWorkerService<T = {}>({
	typescript: ts,
	compilerOptions,
	env,
	uriConverter,
	workerContext,
	languagePlugins = [],
	servicePlugins = [],
	extraApis = {} as T,
}: {
	typescript: typeof import('typescript'),
	compilerOptions: ts.CompilerOptions,
	env: LanguageServiceEnvironment;
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	};
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins?: LanguagePlugin<URI>[];
	servicePlugins?: LanguageServicePlugin[];
	extraApis?: T;
}) {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const sys = createSys(ts.sys, env, env.workspaceFolders.length ? env.workspaceFolders[0] : undefined, uriConverter);
	const language = createLanguage<URI>(
		[
			...languagePlugins,
			{ resolveLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		sys.useCaseSensitiveFileNames,
		{
			getScriptSnapshot(uri) {
				let snapshot = getModelSnapshot(uri);
				if (!snapshot) {
					// fs files
					const cache = fsFileSnapshots.get(uri);
					const fileName = uriConverter.asFileName(uri);
					const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
					if (!cache || cache[0] !== modifiedTime) {
						if (sys.fileExists(fileName)) {
							const text = sys.readFile(fileName);
							const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
							fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
						}
						else {
							fsFileSnapshots.set(uri, [modifiedTime, undefined]);
						}
					}
					snapshot = fsFileSnapshots.get(uri)?.[1];
				}

				return {
					snapshot
				}
			},
		}
	);
	language.typescript = {
		configFileName: undefined,
		sys,
		asFileName: uriConverter.asFileName,
		asScriptId: uriConverter.asUri,
		...createTsLanguageServiceHost(
			ts,
			sys,
			language,
			uriConverter.asUri,
			{
				getCurrentDirectory() {
					return sys.getCurrentDirectory();
				},
				getScriptFileNames() {
					return workerContext.getMirrorModels().map(model => uriConverter.asFileName(model.uri as URI));
				},
				getProjectVersion() {
					const models = workerContext.getMirrorModels();
					if (modelVersions.size === workerContext.getMirrorModels().length) {
						if (models.every(model => modelVersions.get(model) === model.version)) {
							return projectVersion.toString();
						}
					}
					modelVersions.clear();
					for (const model of workerContext.getMirrorModels()) {
						modelVersions.set(model, model.version);
					}
					projectVersion++;
					return projectVersion.toString();
				},
				getScriptSnapshot(fileName) {
					const uri = uriConverter.asUri(fileName);
					return getModelSnapshot(uri);
				},
				getCompilationSettings() {
					return compilerOptions;
				},
			}
		),
	};

	return createWorkerService(language, servicePlugins, env, extraApis);

	function getModelSnapshot(uri: URI) {
		const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
		if (model) {
			const cache = modelSnapshot.get(model);
			if (cache && cache[0] === model.version) {
				return cache[1];
			}
			const text = model.getValue();
			modelSnapshot.set(model, [model.version, {
				getText: (start, end) => text.substring(start, end),
				getLength: () => text.length,
				getChangeRange: () => undefined,
			}]);
			return modelSnapshot.get(model)?.[1];
		}
	}
}

function createWorkerService<T = {}>(
	language: Language<URI>,
	servicePlugins: LanguageServicePlugin[],
	env: LanguageServiceEnvironment,
	extraApis: T = {} as any
): LanguageService & T {

	const languageService = _createLanguageService(language, servicePlugins, env);

	class WorkerService { };

	for (const api in languageService) {
		const isFunction = typeof (languageService as any)[api] === 'function';
		if (isFunction) {
			(WorkerService.prototype as any)[api] = (languageService as any)[api];
		}
	}

	for (const api in extraApis) {
		const isFunction = typeof (extraApis as any)[api] === 'function';
		if (isFunction) {
			(WorkerService.prototype as any)[api] = (extraApis as any)[api];
		}
	}

	return new WorkerService() as any;
}
