import type { URI } from 'vscode-uri';
import type { LanguageServer, ProjectFacade } from '../types';
import type { LanguagePlugin } from '@volar/language-core/lib/types';
import { createLanguage } from '@volar/language-core';
import type { LanguageServiceEnvironment } from '@volar/language-service/lib/types';
import { createLanguageService, type LanguageService } from '@volar/language-service/lib/languageService';


export function createSimpleProject(server: LanguageServer, languagePlugins: LanguagePlugin<URI>[]): ProjectFacade {
	let languageService: LanguageService | undefined;

	let _server: LanguageServer = server;

	return {
		reolveLanguageServiceByUri() {
			languageService ??= create(_server);
			return languageService;
		},
		getExistingLanguageServices() {
			if (languageService) {
				return [languageService];
			}
			return [];
		},
		reload() {
			languageService?.dispose();
			languageService = undefined;
		},
	};

	function create(server: LanguageServer) {
		const language = createLanguage(
			languagePlugins,
			false,
			{
				getScriptSnapshot(uri) {
					const documentKey = server.documents.getSyncedDocumentKey(uri) ?? uri.toString();
					const document = server.documents.documents.get(documentKey);

					return {
						snapshot: document?.getSnapshot(),
						languageId: document?.languageId
					};
				}

			},
		);
		return createLanguageService(
			language,
			server.languageServicePlugins,
			createLanguageServiceEnvironment(server, [...server.workspaceFolders.keys()]),
		);
	}
}

export function createLanguageServiceEnvironment(server: LanguageServer, workspaceFolders: URI[]): LanguageServiceEnvironment {
	return {
		workspaceFolders,
		fs: server.fs,
		locale: server.initializeParams?.locale,
		clientCapabilities: server.initializeParams?.capabilities,
		getConfiguration: server.configurationWatcher.getConfiguration,
		onDidChangeConfiguration: server.configurationWatcher.onDidChangeConfiguration,
		onDidChangeWatchedFiles: server.onDidChangeWatchedFiles,
	};
}
