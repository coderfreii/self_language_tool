import { createLanguageServicePlugin, externalFiles } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin';
import * as vue from '@vue/language-core';
import { decorateLanguageServiceForVue } from './lib/common';
import { projects, startNamedPipeServer } from './lib/server';
import { FileMap } from '@volar/language-core/lib/utils';

const windowsPathReg = /\\/g;
const plugin = createLanguageServicePlugin(
	(ts, info) => {
		const vueOptions = getVueCompilerOptions();
		const vueLanguagePlugin = vue.createLanguagePlugin<string>(
			ts,
			() => info.languageServiceHost.getProjectVersion?.() ?? '',
			info.project.projectKind === ts.server.ProjectKind.Inferred
				? () => true
				: fileName => {
					const fileMap = new FileMap(info.languageServiceHost.useCaseSensitiveFileNames?.() ?? false);
					for (const vueFileName of externalFiles.get(info.project) ?? []) {
						fileMap.set(vueFileName, undefined);
					}
					return fileMap.has(fileName);
				},
			info.languageServiceHost.getCompilationSettings(),
			vueOptions
		);

		return {
			vueLanguagePlugins: [vueLanguagePlugin],
			setup: language => {
				projects.set(info.project, { info, language, vueOptions });

				decorateLanguageServiceForVue(language, info.languageService, vueOptions, ts, true, fileName => fileName);
				startNamedPipeServer(ts, info.project.projectKind, info.project.getCurrentDirectory());

				// #3963
				const timer = setInterval(() => {
					if (info.project['program']) {
						clearInterval(timer);
						(info.project['program'] as any).__vue__ = { language };
					}
				}, 50);
			}
		};

		function getVueCompilerOptions() {
			if (info.project.projectKind === ts.server.ProjectKind.Configured) {
				const tsconfig = info.project.getProjectName();
				return vue.createParsedCommandLineWithVueOptions(ts, ts.sys, tsconfig.replace(windowsPathReg, '/')).vueOptions;
			}
			else {
				return vue.createParsedCommandLineWithVueOptionsByJson(ts, ts.sys, info.languageServiceHost.getCurrentDirectory(), {}).vueOptions;
			}
		}
	}
);

export = plugin;