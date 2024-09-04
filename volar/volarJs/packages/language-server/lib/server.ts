import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { registerEditorFeatures } from './register/registerEditorFeatures';
import { registerLanguageFeatures } from './register/registerLanguageFeatures';
import type { ProjectFacade, VolarInitializeResult } from './types';
import type { FileSystem, LanguageServicePlugin } from '@volar/language-service/lib/types';
import { createUriMap } from '@volar/language-service/lib/utils/uriMap';
import { fsWithCache } from './fs/fsWithCache';
import { workspaceFolderWatcherSetup } from './watcher/workspaceFolderWatcher';
import { configurationWatcherSetup } from './watcher/configurationWatcher';
import { FileWatchersSetup } from './watcher/filerWatcher';
import { documentsSetup } from './uri/documents';
import { diagnosticsSetup } from './diagnostics';


export type LazyHolder = {
	initializeParams: vscode.InitializeParams;
	initializeResult: VolarInitializeResult;
	projectFacade: ProjectFacade;
	languageServicePlugins: LanguageServicePlugin[];
	workspaceFolders: ReturnType<typeof createUriMap<boolean>>,
	connection: vscode.Connection;
	pullModelDiagnostics: boolean;
	diagnostic: ReturnType<typeof diagnosticsSetup.setup>,
};


export type InitializeCallBack = (InitializeParams: vscode.InitializeParams) => {
	languageServicePlugins: LanguageServicePlugin[],
	projectFacade: ProjectFacade,
	options?: {
		pullModelDiagnostics?: boolean;
	};
};


export function createServerBase(
	connection: vscode.Connection,
	fs: FileSystem
) {

	const lazyHolder: LazyHolder = {
		initializeParams: undefined as unknown as vscode.InitializeParams,
		initializeResult: undefined as unknown as VolarInitializeResult,
		projectFacade: undefined as unknown as ProjectFacade,
		languageServicePlugins: undefined as unknown as LanguageServicePlugin[],
		diagnostic: undefined as unknown as ReturnType<typeof diagnosticsSetup.setup>,
		workspaceFolders: createUriMap<boolean>(),
		connection,
		pullModelDiagnostics: false
	};

	const workspaceFolderWatcher = workspaceFolderWatcherSetup.setup();
	const configurationWatcher = configurationWatcherSetup.setup(lazyHolder);
	const FilerWatcher = FileWatchersSetup.setup(lazyHolder);
	const documents = documentsSetup.setup(lazyHolder);


	const server = {
		start() {
			lazyHolder.connection.listen();
		},

		documents,
		fs: fsWithCache.setup(fs),
		onDidChangeWatchedFiles: fsWithCache.onDidChangeWatchedFiles,
		onInitialize,
		initialized,
		shutdown,
		configurationWatcher,
		filerWatcher: FilerWatcher,


		get clearPushDiagnostics() {
			return lazyHolder.diagnostic.clearPushDiagnostics;
		},
		get refresh() {
			return lazyHolder.diagnostic.refresh;
		},
		get pullModelDiagnostics() {
			return lazyHolder.pullModelDiagnostics;
		},
		get connection() {
			return lazyHolder.connection;
		},
		get workspaceFolders() {
			return lazyHolder.workspaceFolders;
		},
		get initializeParams() {
			return lazyHolder.initializeParams;
		},
		get initializeResult() {
			return lazyHolder.initializeResult;
		},
		get projectFacade() {
			return lazyHolder.projectFacade;
		},
		get languageServicePlugins() {
			return lazyHolder.languageServicePlugins;
		},
	};



	connection.onInitialized(() => {
		server.initialized();
	});

	connection.onShutdown(() => {
		server.shutdown();
	});



	return server;



	function onInitialize(callback: InitializeCallBack
	) {
		connection.onInitialize((initializeParams) => {
			//
			lazyHolder.initializeParams = initializeParams;

			initializedWorkSpaceFolder(initializeParams);

			const res = callback(initializeParams);

			return initialize(res.languageServicePlugins, res.projectFacade, res.options);
		});
	}

	function initialize(
		languageServicePlugins: LanguageServicePlugin[],
		projectFacade: ProjectFacade,
		options?: {
			pullModelDiagnostics?: boolean;
		}
	) {
		//
		lazyHolder.projectFacade = projectFacade;


		//
		lazyHolder.languageServicePlugins = languageServicePlugins;

		//
		lazyHolder.pullModelDiagnostics = options?.pullModelDiagnostics ?? false;

		lazyHolder.diagnostic = diagnosticsSetup.setup(lazyHolder, configurationWatcher, documents);

		setupInitializeResult();


		registerEditorFeatures(server);


		registerLanguageFeatures(server);


		return server.initializeResult;
	}

	function initialized() {
		workspaceFolderWatcher.registerWorkspaceFolderWatcher(lazyHolder);
		configurationWatcher.registerConfigurationWatcher();
		updateHttpSettings();
		configurationWatcher.onDidChangeConfiguration(updateHttpSettings);
	}

	async function shutdown() {
		server.projectFacade.reload();
	}

	async function updateHttpSettings() {
		const httpSettings = await configurationWatcher.getConfiguration<{ proxyStrictSSL: boolean; proxy: string; }>('http');
		configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
	}

	function initializedWorkSpaceFolder(initializeParams: vscode.InitializeParams) {
		if (initializeParams.workspaceFolders?.length) {
			for (const folder of initializeParams.workspaceFolders) {
				server.workspaceFolders.set(URI.parse(folder.uri), true);
			}
		}
		else if (initializeParams.rootUri) {
			server.workspaceFolders.set(URI.parse(initializeParams.rootUri), true);
		}
		else if (initializeParams.rootPath) {
			server.workspaceFolders.set(URI.file(initializeParams.rootPath), true);
		}
	}

	function setupInitializeResult() {
		lazyHolder.initializeResult = { capabilities: {} };

		const pluginCapabilities = resolveCapabilitiesFromPlugin();

		server.initializeResult.capabilities = {
			get textDocumentSync(): vscode.TextDocumentSyncKind {
				return vscode.TextDocumentSyncKind.Incremental;
			},
			workspace: {
				// #18
				workspaceFolders: {
					supported: true,
					changeNotifications: true,
				},
			},
			...pluginCapabilities
		};

		if (!server.pullModelDiagnostics && server.initializeResult.capabilities.diagnosticProvider) {
			server.initializeResult.capabilities.diagnosticProvider = undefined;
			lazyHolder.diagnostic.activateServerPushDiagnostics(lazyHolder.projectFacade);
		}

	}

	function resolveCapabilitiesFromPlugin(): vscode.ServerCapabilities<any> {
		const capabilitiesArr = server.languageServicePlugins.map(plugin => plugin.capabilities);

		const capabilities: vscode.ServerCapabilities<any> = {
			selectionRangeProvider: resolveSelectionRangeProvider(),
			foldingRangeProvider: foldingRangeProvider(),
			linkedEditingRangeProvider: linkedEditingRangeProvider(),
			colorProvider: colorProvider(),
			documentSymbolProvider: documentSymbolProvider(),
			documentFormattingProvider: documentFormattingProvider(),
			documentRangeFormattingProvider: documentRangeFormattingProvider(),
			referencesProvider: referencesProvider(),
			implementationProvider: capabilitiesArr.some(data => data.implementationProvider) ? true : undefined,
			definitionProvider: capabilitiesArr.some(data => data.definitionProvider) ? true : undefined,
			typeDefinitionProvider: capabilitiesArr.some(data => data.typeDefinitionProvider) ? true : undefined,
			callHierarchyProvider: capabilitiesArr.some(data => data.callHierarchyProvider) ? true : undefined,
			hoverProvider: capabilitiesArr.some(data => data.hoverProvider) ? true : undefined,
			documentHighlightProvider: capabilitiesArr.some(data => data.documentHighlightProvider) ? true : undefined,
			workspaceSymbolProvider: capabilitiesArr.some(data => data.workspaceSymbolProvider) ? true : undefined,
			renameProvider: capabilitiesArr.some(data => data.renameProvider)
				? { prepareProvider: capabilitiesArr.some(data => data.renameProvider?.prepareProvider) || undefined }
				: undefined,
			documentLinkProvider: capabilitiesArr.some(data => data.documentLinkProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.documentLinkProvider?.resolveProvider) || undefined }
				: undefined,
			codeLensProvider: codeLensProvider(),
			inlayHintProvider: capabilitiesArr.some(data => data.inlayHintProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.inlayHintProvider?.resolveProvider) || undefined }
				: undefined,
			signatureHelpProvider: capabilitiesArr.some(data => data.signatureHelpProvider)
				? {

					triggerCharacters: [...new Set(capabilitiesArr.map(data => data.signatureHelpProvider?.triggerCharacters ?? []).flat())],
					retriggerCharacters: [...new Set(capabilitiesArr.map(data => data.signatureHelpProvider?.retriggerCharacters ?? []).flat())],
				}
				: undefined,
			completionProvider: capabilitiesArr.some(data => data.completionProvider)
				? {
					resolveProvider: capabilitiesArr.some(data => data.completionProvider?.resolveProvider) || undefined,
					triggerCharacters: [...new Set(capabilitiesArr.map(data => data.completionProvider?.triggerCharacters ?? []).flat())],
				}
				: undefined,
			semanticTokensProvider: capabilitiesArr.some(data => data.semanticTokensProvider)
				? {
					range: true,
					full: false,
					legend: {
						tokenTypes: [...new Set(capabilitiesArr.map(data => data.semanticTokensProvider?.legend?.tokenTypes ?? []).flat())],
						tokenModifiers: [...new Set(capabilitiesArr.map(data => data.semanticTokensProvider?.legend?.tokenModifiers ?? []).flat())],
					},
				}
				: undefined,
			codeActionProvider: capabilitiesArr.some(data => data.codeActionProvider)
				? {
					resolveProvider: capabilitiesArr.some(data => data.codeActionProvider?.resolveProvider) || undefined,
					codeActionKinds: capabilitiesArr.some(data => data.codeActionProvider?.codeActionKinds)
						? [...new Set(capabilitiesArr.map(data => data.codeActionProvider?.codeActionKinds ?? []).flat())]
						: undefined,
				}
				: undefined,
			diagnosticProvider: capabilitiesArr.some(data => data.diagnosticProvider)
				? {
					interFileDependencies: true,
					workspaceDiagnostics: capabilitiesArr.some(data => data.diagnosticProvider?.workspaceDiagnostics),
				}
				: undefined,
			documentOnTypeFormattingProvider: capabilitiesArr.some(data => data.documentOnTypeFormattingProvider)
				? {
					firstTriggerCharacter: [...new Set(capabilitiesArr.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())][0],
					moreTriggerCharacter: [...new Set(capabilitiesArr.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())].slice(1),
				}
				: undefined,
		};


		function resolveSelectionRangeProvider() {
			return capabilitiesArr.some(data => data.selectionRangeProvider) ? true : undefined;
		}

		function foldingRangeProvider() {
			return capabilitiesArr.some(data => data.foldingRangeProvider) ? true : undefined;
		}

		function linkedEditingRangeProvider() {
			return capabilitiesArr.some(data => data.linkedEditingRangeProvider) ? true : undefined;
		}

		function colorProvider() {
			return capabilitiesArr.some(data => data.colorProvider) ? true : undefined;
		}

		function documentSymbolProvider() {
			return capabilitiesArr.some(data => data.documentSymbolProvider) ? true : undefined;
		}
		function documentFormattingProvider() {
			return capabilitiesArr.some(data => data.documentFormattingProvider) ? true : undefined;
		}
		function documentRangeFormattingProvider() {
			return capabilitiesArr.some(data => data.documentFormattingProvider) ? true : undefined;
		}

		function referencesProvider() {
			return capabilitiesArr.some(data => data.referencesProvider) ? true : undefined;
		}



		function codeLensProvider() {
			return capabilitiesArr.some(data => data.codeLensProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.codeLensProvider?.resolveProvider) || undefined }
				: undefined;
		}


		if (capabilitiesArr.some(data => data.autoInsertionProvider)) {
			wrapper();
			function wrapper() {
				const triggerCharacterToConfigurationSections = new Map<string, Set<string>>();
				const tryAdd = (char: string, section?: string) => {
					let sectionSet = triggerCharacterToConfigurationSections.get(char);
					if (!sectionSet) {
						triggerCharacterToConfigurationSections.set(char, sectionSet = new Set());
					}
					if (section) {
						sectionSet.add(section);
					}
				};
				for (const data of capabilitiesArr) {
					if (data.autoInsertionProvider) {
						const { triggerCharacters, configurationSections } = data.autoInsertionProvider;
						if (configurationSections) {
							if (configurationSections.length !== triggerCharacters.length) {
								throw new Error('configurationSections.length !== triggerCharacters.length');
							}
							for (let i = 0; i < configurationSections.length; i++) {
								tryAdd(triggerCharacters[i], configurationSections[i]);
							}
						}
						else {
							for (const char of triggerCharacters) {
								tryAdd(char);
							}
						}
					}
				}
				lazyHolder.initializeResult.autoInsertion = {
					triggerCharacters: [],
					configurationSections: [],
				};
				for (const [char, sections] of triggerCharacterToConfigurationSections) {
					if (sections.size) {
						for (const section of sections) {
							lazyHolder.initializeResult.autoInsertion.triggerCharacters.push(char);
							lazyHolder.initializeResult.autoInsertion.configurationSections.push(section);
						}
					}
					else {
						lazyHolder.initializeResult.autoInsertion.triggerCharacters.push(char);
						lazyHolder.initializeResult.autoInsertion.configurationSections.push(null);
					}
				}
			}

		}



		return capabilities;
	}
}
