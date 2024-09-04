import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';
import { decorateLanguageService } from '../node/decorateLanguageService';
import { decorateLanguageServiceHost, searchExternalFiles } from '../node/decorateLanguageServiceHost';
import { createLanguage } from '@volar/language-core';
import * as vue from '@vue/language-core';
import type { Language, LanguagePlugin } from '@volar/language-core/lib/types';


export const externalFiles = new WeakMap<ts.server.Project, string[]>();
export const projectExternalFileExtensions = new WeakMap<ts.server.Project, string[]>();
export const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
export const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

export function createLanguageServicePlugin(
	create: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => {
		vueLanguagePlugins: LanguagePlugin<string>[],
		setup?: (language: Language<string>) => void;
	}
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


					const { vueLanguagePlugins, setup } = create(ts, info);

					const extensions = vue.resolveVueLanguagePluginExtensions(vueLanguagePlugins)	

					projectExternalFileExtensions.set(info.project, extensions);

					const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost);
					const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(info.languageServiceHost);


					const language = createLanguage<string>(
						[
							...vueLanguagePlugins,
							{ resolveLanguageId: resolveFileLanguageId },
						],
						ts.sys.useCaseSensitiveFileNames,
						{
							getScriptSnapshot(fileName) {
								return {
									snapshot : getScriptSnapshot(fileName)
								}
							},
							getScriptVersion
						}
					);

					decorateLanguageService(language, info.languageService);
					decorateLanguageServiceHost(ts, language, info.languageServiceHost);
					setup?.(language);
				}

				return info.languageService;
			},
			getExternalFiles(project, updateLevel = 0) {
				if (
					updateLevel >= (1 satisfies ts.ProgramUpdateLevel.RootNamesAndUpdate)
					|| !externalFiles.has(project)
				) {
					const oldFiles = externalFiles.get(project);
					const extensions = projectExternalFileExtensions.get(project);
					const newFiles = extensions?.length ? searchExternalFiles(ts, project, extensions) : [];
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

export function arrayItemsEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	for (const file of b) {
		if (!set.has(file)) {
			return false;
		}
	}
	return true;
}
