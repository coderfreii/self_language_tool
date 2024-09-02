import * as path from 'path-browserify';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';
import type { createSys } from './createSys';
import { forEachEmbeddedCode } from '@volar/language-core';
import type { Language, TypeScriptExtraServiceScript } from '@volar/language-core/lib/types';
import { FileMap } from '@volar/language-core/lib/utils';

export interface TypeScriptProjectLanguageServiceHost extends Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCurrentDirectory'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
> { }

export function createTsLanguageServiceHost<T>(
	ts: typeof import('typescript'),
	sys: ReturnType<typeof createSys> | ts.System,
	language: Language<T>,
	asScrpitId: (fileName: string) => T,
	projectLanguageServiceHost: TypeScriptProjectLanguageServiceHost,
) {
	const scriptVersions = new FileMap<{ lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>(sys.useCaseSensitiveFileNames);

	let lastProjectVersion: number | string | undefined;
	let tsProjectVersion = 0;
	let tsFileRegistry = new FileMap<boolean>(sys.useCaseSensitiveFileNames);
	let extraScriptRegistry = new FileMap<TypeScriptExtraServiceScript>(sys.useCaseSensitiveFileNames);
	let lastTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
	let lastOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
	let tsLanguageServiceHost: ts.LanguageServiceHost = {
		...sys,
		getCurrentDirectory() {
			return projectLanguageServiceHost.getCurrentDirectory();
		},
		useCaseSensitiveFileNames() {
			return sys.useCaseSensitiveFileNames;
		},
		getNewLine() {
			return sys.newLine;
		},
		getTypeRootsVersion: () => {
			return 'version' in sys ? sys.version : -1; // TODO: only update for /node_modules changes?
		},
		getDirectories(dirName) {
			return sys.getDirectories(dirName);
		},
		readDirectory(dirName, extensions, excludes, includes, depth) {
			const exts = new Set(extensions);
			for (const languagePlugin of language.plugins) {
				for (const ext of languagePlugin.typescript?.extraFileExtensions ?? []) {
					exts.add('.' + ext.extension);
				}
			}
			extensions = [...exts];
			return sys.readDirectory(dirName, extensions, excludes, includes, depth);
		},
		getCompilationSettings() {
			const options = projectLanguageServiceHost.getCompilationSettings();
			if (language.plugins.some(language => language.typescript?.extraFileExtensions.length)) {
				options.allowNonTsExtensions ??= true;
				if (!options.allowNonTsExtensions) {
					console.warn('`allowNonTsExtensions` must be `true`.');
				}
			}
			return options;
		},
		getLocalizedDiagnosticMessages: projectLanguageServiceHost.getLocalizedDiagnosticMessages,
		getProjectReferences: projectLanguageServiceHost.getProjectReferences,
		getDefaultLibFileName: options => {
			try {
				return ts.getDefaultLibFilePath(options);
			} catch {
				// web
				return `/node_modules/typescript/lib/${ts.getDefaultLibFileName(options)}`;
			}
		},
		readFile(fileName) {
			const snapshot = getScriptSnapshot(fileName);
			if (snapshot) {
				return snapshot.getText(0, snapshot.getLength());
			}
		},
		fileExists(fileName) {
			return getScriptVersion(fileName) !== '';
		},
		getProjectVersion() {
			sync();
			return tsProjectVersion + ('version' in sys ? `:${sys.version}` : '');
		},
		getScriptFileNames() {
			sync();
			return [...tsFileRegistry.keys()];
		},
		getScriptKind(fileName) {

			sync();

			if (extraScriptRegistry.has(fileName)) {
				return extraScriptRegistry.get(fileName)!.scriptKind;
			}

			const sourceScript = language.scripts.get(asScrpitId(fileName));
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					return serviceScript.scriptKind;
				}
			}
			switch (path.extname(fileName)) {
				case '.js':
				case '.cjs':
				case '.mjs':
					return ts.ScriptKind.JS;
				case '.jsx':
					return ts.ScriptKind.JSX;
				case '.ts':
				case '.cts':
				case '.mts':
					return ts.ScriptKind.TS;
				case '.tsx':
					return ts.ScriptKind.TSX;
				case '.json':
					return ts.ScriptKind.JSON;
				default:
					return ts.ScriptKind.Unknown;
			}
		},
		getScriptVersion,
		getScriptSnapshot,
	};

	for (const plugin of language.plugins) {
		if (plugin.typescript?.resolveLanguageServiceHost) {
			tsLanguageServiceHost = plugin.typescript.resolveLanguageServiceHost(tsLanguageServiceHost);
		}
	}

	if (language.plugins.some(language => language.typescript?.extraFileExtensions.length)) {

		// TODO: can this share between monorepo packages?
		const moduleCache = ts.createModuleResolutionCache(
			tsLanguageServiceHost.getCurrentDirectory(),
			tsLanguageServiceHost.useCaseSensitiveFileNames?.() ? s => s : s => s.toLowerCase(),
			tsLanguageServiceHost.getCompilationSettings()
		);
		const resolveModuleName = createResolveModuleName(ts, tsLanguageServiceHost, language.plugins, fileName => language.scripts.get(asScrpitId(fileName)));

		let lastSysVersion = 'version' in sys ? sys.version : undefined;

		tsLanguageServiceHost.resolveModuleNameLiterals = (
			moduleLiterals,
			containingFile,
			redirectedReference,
			options,
			sourceFile
		) => {
			if ('version' in sys && lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleLiterals.map(moduleLiteral => {
				return resolveModuleName(moduleLiteral.text, containingFile, options, moduleCache, redirectedReference, sourceFile.impliedNodeFormat);
			});
		};
		tsLanguageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			_reusedNames,
			redirectedReference,
			options
		) => {
			if ('version' in sys && lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleNames.map(moduleName => {
				return resolveModuleName(moduleName, containingFile, options, moduleCache, redirectedReference).resolvedModule;
			});
		};
	}

	return {
		languageServiceHost: tsLanguageServiceHost,
		getExtraServiceScript,
	};

	function getExtraServiceScript(fileName: string) {
		sync();
		return extraScriptRegistry.get(fileName);
	}

	function sync() {

		const newProjectVersion = projectLanguageServiceHost.getProjectVersion?.();
		const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate) {
			return;
		}

		lastProjectVersion = newProjectVersion;
		extraScriptRegistry.clear();

		const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		const tsFileNamesSet = new Set<string>();

		for (const fileName of projectLanguageServiceHost.getScriptFileNames()) {
			const sourceScript = language.scripts.get(asScrpitId(fileName));
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					newTsVirtualFileSnapshots.add(serviceScript.code.snapshot);
					tsFileNamesSet.add(fileName);
				}
				for (const extraServiceScript of sourceScript.generated.languagePlugin.typescript?.getExtraServiceScripts?.(fileName, sourceScript.generated.root) ?? []) {
					newTsVirtualFileSnapshots.add(extraServiceScript.code.snapshot);
					tsFileNamesSet.add(extraServiceScript.fileName);
					extraScriptRegistry.set(extraServiceScript.fileName, extraServiceScript);
				}
				for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
					newOtherVirtualFileSnapshots.add(code.snapshot);
				}
			}
			else {
				tsFileNamesSet.add(fileName);
			}
		}

		if (!setEquals(lastTsVirtualFileSnapshots, newTsVirtualFileSnapshots)) {
			tsProjectVersion++;
		}
		else if (setEquals(lastOtherVirtualFileSnapshots, newOtherVirtualFileSnapshots)) {
			// no any meta language files update, it mean project version was update by source files this time
			tsProjectVersion++;
		}

		lastTsVirtualFileSnapshots = newTsVirtualFileSnapshots;
		lastOtherVirtualFileSnapshots = newOtherVirtualFileSnapshots;
		tsFileRegistry.clear();

		for (const fileName of tsFileNamesSet) {
			tsFileRegistry.set(fileName, true);
		}
	}

	function getScriptSnapshot(fileName: string) {

		sync();

		if (extraScriptRegistry.has(fileName)) {
			return extraScriptRegistry.get(fileName)!.code.snapshot;
		}

		const sourceScript = language.scripts.get(asScrpitId(fileName));

		if (sourceScript?.generated) {
			const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
			if (serviceScript) {
				return serviceScript.code.snapshot;
			}
		}
		else if (sourceScript) {
			return sourceScript.snapshot;
		}
	}

	function getScriptVersion(fileName: string): string {

		sync();

		if (!scriptVersions.has(fileName)) {
			scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
		}

		const version = scriptVersions.get(fileName)!;

		if (extraScriptRegistry.has(fileName)) {
			const snapshot = extraScriptRegistry.get(fileName)!.code.snapshot;
			if (!version.map.has(snapshot)) {
				version.map.set(snapshot, version.lastVersion++);
			}
			return version.map.get(snapshot)!.toString();
		}

		const sourceScript = language.scripts.get(asScrpitId(fileName));

		if (sourceScript?.generated) {
			const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
			if (serviceScript) {
				if (!version.map.has(serviceScript.code.snapshot)) {
					version.map.set(serviceScript.code.snapshot, version.lastVersion++);
				}
				return version.map.get(serviceScript.code.snapshot)!.toString();
			}
		}

		const isOpenedFile = !!projectLanguageServiceHost.getScriptSnapshot(fileName);

		if (isOpenedFile) {
			const sourceScript = language.scripts.get(asScrpitId(fileName));
			if (sourceScript && !sourceScript.generated) {
				if (!version.map.has(sourceScript.snapshot)) {
					version.map.set(sourceScript.snapshot, version.lastVersion++);
				}
				return version.map.get(sourceScript.snapshot)!.toString();
			}
		}

		if (sys.fileExists(fileName)) {
			return sys.getModifiedTime?.(fileName)?.valueOf().toString() ?? '0';
		}

		return '';
	}
}

function setEquals<T>(a: Set<T>, b: Set<T>) {
	if (a.size !== b.size) {
		return false;
	}
	for (const item of a) {
		if (!b.has(item)) {
			return false;
		}
	}
	return true;
}
