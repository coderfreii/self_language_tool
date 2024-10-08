import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';
import { decorateLanguageService } from '../node/decorateLanguageService';
import { decorateLanguageServiceHost, searchExternalFiles } from '../node/decorateLanguageServiceHost';
import { arrayItemsEqual } from './createLanguageServicePlugin';
import { createLanguage } from '@volar/language-core';
import type { Language, LanguagePlugin } from '@volar/language-core/lib/types';

const externalFiles = new WeakMap<ts.server.Project, string[]>();
const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

export function createAsyncLanguageServicePlugin(
	extensions: string[],
	scriptKind: ts.ScriptKind,
	create: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => Promise<{
		languagePlugins: LanguagePlugin<string>[],
		setup?: (language: Language<string>) => void;
	}>
): ts.server.PluginModuleFactory {
	return modules => {
		const { typescript: ts } = modules;
		const pluginModule: ts.server.PluginModule = {
			create(info) {
				if (
					!decoratedLanguageServices.has(info.languageService)
					&& !decoratedLanguageServiceHosts.has(info.languageServiceHost)
				) {
					decoratedLanguageServices.add(info.languageService);
					decoratedLanguageServiceHosts.add(info.languageServiceHost);

					const emptySnapshot = ts.ScriptSnapshot.fromString('');
					const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost);
					const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(info.languageServiceHost);
					const getScriptKind = info.languageServiceHost.getScriptKind?.bind(info.languageServiceHost);
					const getProjectVersion = info.languageServiceHost.getProjectVersion?.bind(info.languageServiceHost);

					let initialized = false;

					info.languageServiceHost.getScriptSnapshot = fileName => {
						if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
							return emptySnapshot;
						}
						return getScriptSnapshot(fileName);
					};
					info.languageServiceHost.getScriptVersion = fileName => {
						if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
							return 'initializing...';
						}
						return getScriptVersion(fileName);
					};
					if (getScriptKind) {
						info.languageServiceHost.getScriptKind = fileName => {
							if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
								return scriptKind; // TODO: bypass upstream bug
							}
							return getScriptKind(fileName);
						};
					}
					if (getProjectVersion) {
						info.languageServiceHost.getProjectVersion = () => {
							if (!initialized) {
								return getProjectVersion() + ',initializing...';
							}
							return getProjectVersion();
						};
					}

					create(ts, info).then(({ languagePlugins, setup }) => {
						const language = createLanguage<string>(
							[
								...languagePlugins,
								{ resolveLanguageId: resolveFileLanguageId },
							],
							ts.sys.useCaseSensitiveFileNames,
							{
								getScriptSnapshot(fileName) {
									return {
										snapshot: getScriptSnapshot(fileName)
									};
								},
								getScriptVersion
							}
						);

						decorateLanguageService(language, info.languageService);
						decorateLanguageServiceHost(ts, language, info.languageServiceHost);
						setup?.(language);

						info.project.markAsDirty();
						initialized = true;
					});
				}

				return info.languageService;
			},
			getExternalFiles(project, updateLevel = 0) {
				if (
					updateLevel >= (1 satisfies ts.ProgramUpdateLevel.RootNamesAndUpdate)
					|| !externalFiles.has(project)
				) {
					const oldFiles = externalFiles.get(project);
					const newFiles = extensions.length ? searchExternalFiles(ts, project, extensions) : [];
					externalFiles.set(project, newFiles);
					if (oldFiles && !arrayItemsEqual(oldFiles, newFiles)) {
						project.refreshDiagnostics();
					}
				}
				return externalFiles.get(project)!;
			},
		};
		return pluginModule;
	};
}
