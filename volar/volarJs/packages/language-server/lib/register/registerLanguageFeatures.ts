import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import type { LanguageServer } from '../types';
import type { LanguageService } from '@volar/language-service/lib/languageService';
import { mergeWorkspaceEdits } from '@volar/language-service/lib/features/provideRenameEdits';
import type { CancellationToken, ServerCapabilities } from 'vscode-languageserver';



type A = {
	capabilities: (keyof ServerCapabilities<any> | "just")[];
	run: () => void;
};




export function registerLanguageFeatures(server: LanguageServer) {
	let lastCompleteUri: string;
	let lastCompleteLs: LanguageService;
	let lastCodeLensLs: LanguageService;
	let lastCodeActionLs: LanguageService;
	let lastCallHierarchyLs: LanguageService;
	let lastDocumentLinkLs: LanguageService;
	let lastInlayHintLs: LanguageService;


	server.initializeResult.capabilities;


	function registerCapabilitiesListener(a: A) {
		const find = a.capabilities.find(c => {
			if (c === "just") {
				return true;
			}
			return !!server.initializeResult.capabilities[c];
		});

		if (find) {
			a.run();
			console.log(`--------------${find}---enabled--------------`);
		}
	}




	registerCapabilitiesListener({
		capabilities: ["documentFormattingProvider"],
		run() {
			server.connection.onDocumentFormatting(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentFormattingEdits(uri, params.options, undefined, undefined, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["documentRangeFormattingProvider"],
		run() {
			server.connection.onDocumentRangeFormatting(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentFormattingEdits(uri, params.options, params.range, undefined, token);
				});
			});
		},
	});

	registerCapabilitiesListener({
		capabilities: ["documentOnTypeFormattingProvider"],
		run() {
			server.connection.onDocumentOnTypeFormatting(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentFormattingEdits(uri, params.options, undefined, params, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["selectionRangeProvider"],
		run() {
			server.connection.onRequest(vscode.SelectionRangeRequest.type, async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getSelectionRanges(uri, params.positions, token);
				});
			});

			server.connection.onSelectionRanges(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getSelectionRanges(uri, params.positions, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["foldingRangeProvider"],
		run() {
			server.connection.onFoldingRanges(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getFoldingRanges(uri, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["linkedEditingRangeProvider"],
		run() {
			server.connection.languages.onLinkedEditingRange(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getLinkedEditingRanges(uri, params.position, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["documentSymbolProvider"],
		run() {
			server.connection.onDocumentSymbol(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentSymbols(uri, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["colorProvider"],
		run() {
			server.connection.onDocumentColor(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentColors(uri, token);
				});
			});


			server.connection.onColorPresentation(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getColorPresentations(uri, params.color, params.range, token);
				});
			});
		},
	});



	registerCapabilitiesListener({
		capabilities: ["completionProvider", "inlineCompletionProvider"],
		run() {
			server.connection.onCompletion(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, async languageService => {
					lastCompleteUri = params.textDocument.uri;
					lastCompleteLs = languageService;
					const list = await languageService.getCompletionItems(
						uri,
						params.position,
						params.context,
						token
					);
					for (const item of list.items) {
						fixTextEdit(item);
					}
					return list;
				});
			});

			server.connection.onCompletionResolve(async (item, token) => {
				if (lastCompleteUri && lastCompleteLs) {
					item = await lastCompleteLs.resolveCompletionItem(item, token);
					fixTextEdit(item);
				}
				return item;
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["hoverProvider"],
		run() {
			server.connection.onHover(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getHover(uri, params.position, token);
				});
			});
		},
	});

	registerCapabilitiesListener({
		capabilities: ["signatureHelpProvider"],
		run() {
			server.connection.onSignatureHelp(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getSignatureHelp(uri, params.position, params.context, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["renameProvider"],
		run() {
			server.connection.onPrepareRename(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, async languageService => {
					const result = await languageService.getRenameRange(uri, params.position, token);
					if (result && 'message' in result) {
						return new vscode.ResponseError(0, result.message);
					}
					return result;
				});
			});
			server.connection.onRenameRequest(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getRenameEdits(uri, params.position, params.newName, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["codeLensProvider"],
		run() {
			server.connection.onCodeLens(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					lastCodeLensLs = languageService;
					return languageService.getCodeLenses(uri, token);
				});
			});
			server.connection.onCodeLensResolve(async (codeLens, token) => {
				return await lastCodeLensLs?.resolveCodeLens(codeLens, token) ?? codeLens;
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["codeActionProvider"],
		run() {
			server.connection.onCodeAction(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, async languageService => {
					lastCodeActionLs = languageService;
					let codeActions = await languageService.getCodeActions(uri, params.range, params.context, token) ?? [];
					for (const codeAction of codeActions) {
						if (codeAction.data && typeof codeAction.data === 'object') {
							(codeAction.data as any).uri = params.textDocument.uri;
						}
						else {
							codeAction.data = { uri: params.textDocument.uri };
						}
					}
					if (!server.initializeParams?.capabilities.textDocument?.codeAction?.disabledSupport) {
						codeActions = codeActions.filter(codeAction => !codeAction.disabled);
					}
					return codeActions;
				});
			});
			server.connection.onCodeActionResolve(async (codeAction, token) => {
				return await lastCodeActionLs?.resolveCodeAction(codeAction, token) ?? codeAction;
			});
		},
	});



	registerCapabilitiesListener({
		capabilities: ["referencesProvider"],
		run() {
			server.connection.onReferences(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getReferences(uri, params.position, { includeDeclaration: true }, token);
				});
			});
			server.connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getFileReferences(uri, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["implementationProvider"],
		run() {
			server.connection.onImplementation(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getImplementations(uri, params.position, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["definitionProvider"],
		run() {
			server.connection.onDefinition(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDefinition(uri, params.position, token);
				});
			});
		},
	});

	registerCapabilitiesListener({
		capabilities: ["typeDefinitionProvider"],
		run() {
			server.connection.onTypeDefinition(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getTypeDefinition(uri, params.position, token);
				});
			});
		},
	});



	registerCapabilitiesListener({
		capabilities: ["documentHighlightProvider"],
		run() {
			server.connection.onDocumentHighlight(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getDocumentHighlights(uri, params.position, token);
				});
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["documentLinkProvider"],
		run() {
			server.connection.onDocumentLinks(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					lastDocumentLinkLs = languageService;
					return languageService.getDocumentLinks(uri, token);
				});
			});

			server.connection.onDocumentLinkResolve(async (link, token) => {
				return await lastDocumentLinkLs?.resolveDocumentLink(link, token);
			});
		},
	});

	registerCapabilitiesListener({
		capabilities: ["workspaceSymbolProvider"],
		run() {
			server.connection.onWorkspaceSymbol(async (params, token) => {
				let results: vscode.WorkspaceSymbol[] = [];
				for (const languageService of await server.projectFacade.getExistingLanguageServices()) {
					if (token.isCancellationRequested) {
						return;
					}
					results = results.concat(await languageService.getWorkspaceSymbols(params.query, token));
				}
				return results;
			});
		},
	});



	registerCapabilitiesListener({
		capabilities: ["callHierarchyProvider"],
		run() {
			// TODO: onWorkspaceSymbolResolve
			server.connection.languages.callHierarchy.onPrepare(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					lastCallHierarchyLs = languageService;
					return languageService.getCallHierarchyItems(uri, params.position, token);
				}) ?? [];
			});
			server.connection.languages.callHierarchy.onIncomingCalls(async (params, token) => {
				return await lastCallHierarchyLs?.getCallHierarchyIncomingCalls(params.item, token) ?? [];
			});
			server.connection.languages.callHierarchy.onOutgoingCalls(async (params, token) => {
				return await lastCallHierarchyLs?.getCallHierarchyOutgoingCalls(params.item, token) ?? [];
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["semanticTokensProvider"],
		run() {
			server.connection.languages.semanticTokens.on(async (params, token, _, resultProgress) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, async languageService => {
					return await languageService?.getSemanticTokens(
						uri,
						undefined,
						server.initializeResult.capabilities.semanticTokensProvider!.legend,
						token,
						tokens => resultProgress?.report(tokens)
					);
				}) ?? { data: [] };
			});
			server.connection.languages.semanticTokens.onRange(async (params, token, _, resultProgress) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, async languageService => {
					return await languageService?.getSemanticTokens(
						uri,
						params.range,
						server.initializeResult.capabilities.semanticTokensProvider!.legend,
						token,
						tokens => resultProgress?.report(tokens)
					);
				}) ?? { data: [] };
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["diagnosticProvider"],
		run() {
			server.connection.languages.diagnostics.on(async (params, token, _workDoneProgressReporter, resultProgressReporter) => {
				const uri = URI.parse(params.textDocument.uri);
				const result = await worker(uri, token, languageService => {
					return languageService.getDiagnostics(
						uri,
						token,
						errors => {
							// resultProgressReporter is undefined in vscode
							resultProgressReporter?.report({
								relatedDocuments: {
									[params.textDocument.uri]: {
										kind: vscode.DocumentDiagnosticReportKind.Full,
										items: errors,
									},
								},
							});
						}
					);
				});
				return {
					kind: vscode.DocumentDiagnosticReportKind.Full,
					items: result ?? [],
				};
			});
		},
	});



	registerCapabilitiesListener({
		capabilities: ["inlayHintProvider"],
		run() {
			server.connection.languages.inlayHint.on(async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					lastInlayHintLs = languageService;
					return languageService.getInlayHints(uri, params.range, token);
				});
			});
			server.connection.languages.inlayHint.resolve(async (hint, token) => {
				return await lastInlayHintLs?.resolveInlayHint(hint, token) ?? hint;
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["workspace"],
		run() {
			server.connection.workspace.onWillRenameFiles(async (params, token) => {
				const _edits = await Promise.all(params.files.map(async file => {
					const oldUri = URI.parse(file.oldUri);
					const newUri = URI.parse(file.newUri);
					return await worker(oldUri, token, languageService => {
						return languageService.getFileRenameEdits(oldUri, newUri, token) ?? null;
					}) ?? null;
				}));
				const edits = _edits.filter((edit): edit is NonNullable<typeof edit> => !!edit);
				if (edits.length) {
					mergeWorkspaceEdits(edits[0], ...edits.slice(1));
					return edits[0];
				}
				return null;
			});
		},
	});


	registerCapabilitiesListener({
		capabilities: ["just"],
		run() {
			server.connection.onRequest(AutoInsertRequest.type, async (params, token) => {
				const uri = URI.parse(params.textDocument.uri);
				return await worker(uri, token, languageService => {
					return languageService.getAutoInsertSnippet(uri, params.selection, params.change, token);
				});
			});

		},
	});

	function worker<T>(uri: URI, token: CancellationToken, cb: (languageService: LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			const timeout = setTimeout(async () => {
				clearTimeout(timeout);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const languageService = (await server.projectFacade.reolveLanguageServiceByUri(uri));
				const result = await cb(languageService);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				resolve(result);
			}, 0);
		});
	}

	function fixTextEdit(item: vscode.CompletionItem) {
		const insertReplaceSupport = server.initializeParams?.capabilities.textDocument?.completion?.completionItem?.insertReplaceSupport ?? false;
		if (!insertReplaceSupport) {
			if (item.textEdit && vscode.InsertReplaceEdit.is(item.textEdit)) {
				item.textEdit = vscode.TextEdit.replace(item.textEdit.insert, item.textEdit.newText);
			}
		}
	}
}

export function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
