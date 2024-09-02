import { createLanguage } from '@volar/language-core';
import type { LanguagePlugin } from '@volar/language-core/lib/types';
import { createLanguageServiceEnvironment } from '@volar/language-server/lib/project/simpleProject';
import type { LanguageServer, ProjectFacade } from '@volar/language-server/lib/types';
import type { LanguageServiceEnvironment, ProviderResult } from '@vue/language-service';
import { searchNamedPipeServerForFile, TypeScriptProjectLanguageServiceHost } from '@vue/typescript-plugin/lib/utils';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { createUriMap } from '@volar/language-service/lib/utils/uriMap';
import { createLanguageService, type LanguageService } from '@volar/language-service/lib/languageService';
import { Disposable } from 'vscode-languageserver-protocol';

export type GetLanguagePlugin<T> = (params: {
	serviceEnv: LanguageServiceEnvironment,
	asFileName: (scriptId: T) => string,
	configFileName?: string,
	projectHost?: TypeScriptProjectLanguageServiceHost,
	sys?: ts.System & {
		version: number;
		sync(): Promise<number>;
	} & Disposable,
}) => ProviderResult<LanguagePlugin<URI>[]>;

export function createHybridModeProjectFacade(
	s: LanguageServer,
	sys: ts.System,
	getLanguagePlugins: GetLanguagePlugin<URI>,
): ProjectFacade {
	let initialized = false;
	let simpleLs: Promise<LanguageService> | undefined;
	let serviceEnv: LanguageServiceEnvironment | undefined;
	let server: LanguageServer = s;

	
	const tsconfigProjects = createUriMap<Promise<LanguageService>>(sys.useCaseSensitiveFileNames);

	return {
		async reolveLanguageServiceByUri(uri) {
			if (!initialized) {
				initialized = true;
				initialize(server);
			}

			const fileName = asFileName(uri);
			const projectInfo = (await searchNamedPipeServerForFile(fileName))?.projectInfo;
			if (projectInfo?.kind === ts.server.ProjectKind.Configured) {
				const tsconfig = projectInfo.name;
				const tsconfigUri = URI.file(tsconfig);
				if (!tsconfigProjects.has(tsconfigUri)) {
					tsconfigProjects.set(tsconfigUri, (async () => {
						serviceEnv ??= createLanguageServiceEnvironment(server, [...server.workspaceFolders.keys()]);
						const languagePlugins = await getLanguagePlugins({
							serviceEnv,
							configFileName: tsconfig,
							sys: {
								...sys,
								version: 0,
								async sync() {
									return 0;
								},
								dispose() { },
							},
							asFileName,
						});
						return createLs(server, serviceEnv, languagePlugins);
					})());
				}
				return await tsconfigProjects.get(tsconfigUri)!;
			}
			else {
				simpleLs ??= (async () => {
					serviceEnv ??= createLanguageServiceEnvironment(server, [...server.workspaceFolders.keys()]);
					const languagePlugins = await getLanguagePlugins({ serviceEnv, asFileName });
					return createLs(server, serviceEnv, languagePlugins);
				})();
				return await simpleLs;
			}
		},
		async getExistingLanguageServices() {
			return Promise.all([
				...tsconfigProjects.values(),
				simpleLs,
			].filter(notEmpty));
		},
		reload() {
			for (const ls of [
				...tsconfigProjects.values(),
				simpleLs,
			]) {
				ls?.then(ls => ls.dispose());
			}
			tsconfigProjects.clear();
			simpleLs = undefined;
		},
	};

	function asFileName(uri: URI) {
		return uri.fsPath.replace(/\\/g, '/');
	}

	function initialize(server: LanguageServer) {
		server.onDidChangeWatchedFiles(({ changes }) => {
			for (const change of changes) {
				const changeUri = URI.parse(change.uri);
				if (tsconfigProjects.has(changeUri)) {
					tsconfigProjects.get(changeUri)?.then(project => project.dispose());
					tsconfigProjects.delete(changeUri);
					server.clearPushDiagnostics();
				}
			}
		});
	}

	function createLs(
		server: LanguageServer,
		serviceEnv: LanguageServiceEnvironment,
		languagePlugins: LanguagePlugin<URI>[],
	) {
		const language = createLanguage(languagePlugins, createUriMap(), uri => {
			const documentKey = server.documents.getSyncedDocumentKey(uri);
			const document = documentKey ? server.documents.documents.get(documentKey) : undefined;
			if (document) {
				language.scripts.set(uri, document.getSnapshot(), document.languageId);
			}
			else {
				language.scripts.delete(uri);
			}
		});
		return createLanguageService(
			language,
			server.languageServicePlugins,
			serviceEnv,
		);
	}
}

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
