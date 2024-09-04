import * as vscode_languageserver  from 'vscode-languageserver';
import * as __ from '@volar/language-core/lib/types';
import * as vscode_languageserver_node from 'vscode-languageserver/node';

import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { forEachEmbeddedCode } from '@volar/language-core';
import { SourceMap } from '@volar/source-map';
export type LanguageServerHandle = ReturnType<typeof startLanguageServer>;

export function startLanguageServer(serverModule: string, cwd?: string | URL) {

	const childProcess = cp.fork(
		serverModule,
		['--stdio', `--clientProcessId=${process.pid.toString()}`],
		{
			execArgv: ['--nolazy'],
			env: process.env,
			cwd,
			stdio: 'pipe',
		}
	);
	const connection = vscode_languageserver_node.createProtocolConnection(
		childProcess.stdout!,
		childProcess.stdin!
	);
	const openedDocuments = new Map<string, TextDocument>();
	const settings: any = {};

	let untitledCounter = 0;
	let running = false;

	connection.listen();
	connection.onClose(e => console.log(e));
	connection.onUnhandledNotification(e => console.log(e));
	connection.onError(e => console.log(e));
	connection.onNotification(vscode_languageserver.LogMessageNotification.type, e => {
		if (e.type === vscode_languageserver.MessageType.Error || e.type === vscode_languageserver.MessageType.Warning) {
			console.error(e.message);
		} else {
			console.log(e.message);
		}
	});
	connection.onDispose(() => {
		connection.end();
	});
	connection.onRequest(vscode_languageserver.ConfigurationRequest.type, ({ items }) => {
		return items.map(item => {
			if (item.section) {
				return getConfiguration(item.section);
			}
		});
	});

	return {
		process: childProcess,
		connection,
		async initialize(
			rootUri: string,
			initializationOptions: vscode_languageserver._InitializeParams['initializationOptions'],
			capabilities: vscode_languageserver.ClientCapabilities = {},
			locale?: string
		) {
			const result = await connection.sendRequest(
				vscode_languageserver.InitializeRequest.type,
				{
					processId: childProcess.pid ?? null,
					rootUri,
					initializationOptions,
					capabilities,
					locale,
				} satisfies vscode_languageserver.InitializeParams
			);
			await connection.sendNotification(
				vscode_languageserver.InitializedNotification.type,
				{} satisfies vscode_languageserver.InitializedParams
			);
			running = true;
			return result;
		},
		async shutdown() {
			running = false;
			await connection.sendRequest(vscode_languageserver.ShutdownRequest.type);
			openedDocuments.clear();
		},
		async openTextDocument(fileName: string, languageId: string) {
			const uri = URI.file(fileName).toString();
			if (!openedDocuments.has(uri)) {
				const document = TextDocument.create(uri, languageId, 0, fs.readFileSync(fileName, 'utf-8'));
				openedDocuments.set(uri, document);
				await connection.sendNotification(
					vscode_languageserver.DidOpenTextDocumentNotification.type,
					{
						textDocument: {
							uri,
							languageId,
							version: document.version,
							text: document.getText(),
						},
					} satisfies vscode_languageserver.DidOpenTextDocumentParams
				);
			}
			return openedDocuments.get(uri)!;
		},
		async openUntitledDocument(content: string, languageId: string) {
			const uri = URI.from({ scheme: 'untitled', path: `Untitled-${untitledCounter++}` }).toString();
			const document = TextDocument.create(uri, languageId, 0, content);
			openedDocuments.set(uri, document);
			await connection.sendNotification(
				vscode_languageserver.DidOpenTextDocumentNotification.type,
				{
					textDocument: {
						uri,
						languageId,
						version: document.version,
						text: document.getText(),
					},
				} satisfies vscode_languageserver.DidOpenTextDocumentParams
			);
			return document;
		},
		async openInMemoryDocument(uri: string, languageId: string, content: string) {
			const oldDocument = openedDocuments.get(uri);
			if (oldDocument) {
				await this.closeTextDocument(uri);
			}
			const document = TextDocument.create(uri, languageId, (oldDocument?.version ?? 0) + 1, content);
			openedDocuments.set(uri, document);
			await connection.sendNotification(
				vscode_languageserver.DidOpenTextDocumentNotification.type,
				{
					textDocument: {
						uri,
						languageId,
						version: document.version,
						text: document.getText(),
					},
				} satisfies vscode_languageserver.DidOpenTextDocumentParams
			);
			return document;
		},
		closeTextDocument(uri: string) {
			assert(openedDocuments.has(uri));
			openedDocuments.delete(uri);
			return connection.sendNotification(
				vscode_languageserver.DidCloseTextDocumentNotification.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.DidCloseTextDocumentParams
			);
		},
		async updateTextDocument(uri: string, edits: vscode_languageserver.TextEdit[]) {
			let document = openedDocuments.get(uri);
			assert(document);
			const newText = TextDocument.applyEdits(document, edits);
			document = TextDocument.create(uri, document.languageId, document.version + 1, newText);
			openedDocuments.set(uri, document);
			await connection.sendNotification(
				vscode_languageserver.DidChangeTextDocumentNotification.type,
				{
					textDocument: {
						uri: document.uri,
						version: document.version,
					},
					contentChanges: [{ text: document.getText() }],
				} satisfies vscode_languageserver.DidChangeTextDocumentParams
			);
			return document;
		},
		async updateConfiguration(newSettings: any) {
			Object.assign(settings, newSettings);
			if (running) {
				await connection.sendNotification(
					vscode_languageserver.DidChangeConfigurationNotification.type,
					{ settings } satisfies vscode_languageserver.DidChangeConfigurationParams
				);
			}
		},
		didChangeWatchedFiles(changes: vscode_languageserver.FileEvent[]) {
			return connection.sendNotification(
				vscode_languageserver.DidChangeWatchedFilesNotification.type,
				{ changes } satisfies vscode_languageserver.DidChangeWatchedFilesParams
			);
		},
		async sendCompletionRequest(uri: string, position: vscode_languageserver.Position) {
			const result = await connection.sendRequest(
				vscode_languageserver.CompletionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.CompletionParams
			);
			// @volar/language-server only returns CompletionList
			assert(!Array.isArray(result));
			return result;
		},
		sendCompletionResolveRequest(item: vscode_languageserver.CompletionItem) {
			return connection.sendRequest(
				vscode_languageserver.CompletionResolveRequest.type,
				item satisfies vscode_languageserver.CompletionItem
			);
		},
		sendDocumentDiagnosticRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.DocumentDiagnosticRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.DocumentDiagnosticParams
			);
		},
		sendHoverRequest(uri: string, position: vscode_languageserver.Position) {
			return connection.sendRequest(
				vscode_languageserver.HoverRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.HoverParams
			);
		},
		sendDocumentFormattingRequest(uri: string, options: vscode_languageserver.FormattingOptions) {
			return connection.sendRequest(
				vscode_languageserver.DocumentFormattingRequest.type,
				{
					textDocument: { uri },
					options,
				} satisfies vscode_languageserver.DocumentFormattingParams
			);
		},
		sendDocumentRangeFormattingRequestRequest(uri: string, range: vscode_languageserver.Range, options: vscode_languageserver.FormattingOptions) {
			return connection.sendRequest(
				vscode_languageserver.DocumentRangeFormattingRequest.type,
				{
					textDocument: { uri },
					range,
					options,
				} satisfies vscode_languageserver.DocumentRangeFormattingParams
			);
		},
		sendRenameRequest(uri: string, position: vscode_languageserver.Position, newName: string) {
			return connection.sendRequest(
				vscode_languageserver.RenameRequest.type,
				{
					textDocument: { uri },
					position,
					newName,
				} satisfies vscode_languageserver.RenameParams
			);
		},
		sendPrepareRenameRequest(uri: string, position: vscode_languageserver.Position) {
			return connection.sendRequest(
				vscode_languageserver.PrepareRenameRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.PrepareRenameParams
			);
		},
		sendFoldingRangesRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.FoldingRangeRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.FoldingRangeParams
			);
		},
		sendDocumentSymbolRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.DocumentSymbolRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.DocumentSymbolParams
			);
		},
		sendDocumentColorRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.DocumentColorRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.DocumentColorParams
			);
		},
		sendDefinitionRequest(uri: string, position: vscode_languageserver.Position) {
			return connection.sendRequest(
				vscode_languageserver.DefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.DefinitionParams
			);
		},
		sendTypeDefinitionRequest(uri: string, position: vscode_languageserver.Position) {
			return connection.sendRequest(
				vscode_languageserver.TypeDefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.TypeDefinitionParams
			);
		},
		sendReferencesRequest(uri: string, position: vscode_languageserver.Position, context: vscode_languageserver.ReferenceContext) {
			return connection.sendRequest(
				vscode_languageserver.ReferencesRequest.type,
				{
					textDocument: { uri },
					position,
					context,
				} satisfies vscode_languageserver.ReferenceParams
			);
		},
		sendSignatureHelpRequest(uri: string, position: vscode_languageserver.Position) {
			return connection.sendRequest(
				vscode_languageserver.SignatureHelpRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies vscode_languageserver.SignatureHelpParams
			);
		},
		sendSelectionRangesRequest(uri: string, positions: vscode_languageserver.Position[]) {
			return connection.sendRequest(
				vscode_languageserver.SelectionRangeRequest.type,
				{
					textDocument: { uri },
					positions,
				} satisfies vscode_languageserver.SelectionRangeParams
			);
		},
		sendCodeActionsRequest(uri: string, range: vscode_languageserver.Range, context: vscode_languageserver.CodeActionContext) {
			return connection.sendRequest(
				vscode_languageserver.CodeActionRequest.type,
				{
					textDocument: { uri },
					range,
					context,
				} satisfies vscode_languageserver.CodeActionParams
			);
		},
		sendCodeActionResolveRequest(codeAction: vscode_languageserver.CodeAction) {
			return connection.sendRequest(
				vscode_languageserver.CodeActionResolveRequest.type,
				codeAction satisfies vscode_languageserver.CodeAction
			);
		},
		sendExecuteCommandRequest(command: string, args?: any[]) {
			return connection.sendRequest(
				vscode_languageserver.ExecuteCommandRequest.type,
				{
					command,
					arguments: args,
				} satisfies vscode_languageserver.ExecuteCommandParams
			);
		},
		sendSemanticTokensRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.SemanticTokensRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.SemanticTokensParams
			);
		},
		sendSemanticTokensRangeRequest(uri: string, range: vscode_languageserver.Range) {
			return connection.sendRequest(
				vscode_languageserver.SemanticTokensRangeRequest.type,
				{
					textDocument: { uri },
					range,
				} satisfies vscode_languageserver.SemanticTokensRangeParams
			);
		},
		sendColorPresentationRequest(uri: string, color: vscode_languageserver.Color, range: vscode_languageserver.Range) {
			return connection.sendRequest(
				vscode_languageserver.ColorPresentationRequest.type,
				{
					textDocument: { uri },
					color,
					range,
				} satisfies vscode_languageserver.ColorPresentationParams
			);
		},
		sendDocumentLinkRequest(uri: string) {
			return connection.sendRequest(
				vscode_languageserver.DocumentLinkRequest.type,
				{
					textDocument: { uri },
				} satisfies vscode_languageserver.DocumentLinkParams
			);
		},
		sendDocumentLinkResolveRequest(link: vscode_languageserver.DocumentLink) {
			return connection.sendRequest(
				vscode_languageserver.DocumentLinkResolveRequest.type,
				link satisfies vscode_languageserver.DocumentLink
			);
		},
	};

	function getConfiguration(section: string) {
		if (section in settings) {
			return settings[section];
		}
		let result: any;
		for (const settingKey in settings) {
			if (settingKey.startsWith(`${section}.`)) {
				const value = settings[settingKey];
				const props = settingKey.substring(section.length + 1).split('.');
				result ??= {};
				let current = result;
				while (props.length > 1) {
					const prop = props.shift()!;
					if (typeof current[prop] !== 'object') {
						current[prop] = {};
					}
					current = current[prop];
				}
				current[props.shift()!] = value;
			}
		}
		return result;
	}
}

export function* printSnapshots(sourceScript: __.SourceScript<URI>) {
	if (sourceScript.generated) {
		let lastId = 0;
		for (const file of forEachEmbeddedCode(sourceScript.generated.root)) {
			const id = lastId++;
			yield `#${id}`;
			for (const line of printSnapshot(sourceScript, file)) {
				yield '  ' + line;
			}
		}
	}
}

export function* printSnapshot(
	sourceScript: {
		snapshot: __.SourceScript<URI>['snapshot'];
	},
	file:__.VirtualCode,
) {

	const sourceCode = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength());
	const sourceFileDocument = TextDocument.create('', '', 0, sourceCode);
	const virtualCode = file.snapshot.getText(0, file.snapshot.getLength());
	const virtualCodeLines = virtualCode.split('\n');

	for (let i = 0; i < virtualCodeLines.length - 2; i++) {
		virtualCodeLines[i] += '\n';
	}

	let lineOffset = 0;

	const map = new SourceMap(file.mappings);

	for (let i = 0; i < virtualCodeLines.length; i++) {
		const line = virtualCodeLines[i];
		const lineHead = `[${i + 1}]`;
		yield [lineHead, normalizeLogText(line)].join(' ');
		const logs: {
			mapping: __.CodeMapping;
			line: string;
			lineOffset: number;
			sourceOffset: number;
			generatedOffset: number;
			length: number;
		}[] = [];
		for (let offset = 0; offset < line.length; offset++) {
			for (const [sourceOffset, mapping] of map.getSourceOffsets(lineOffset + offset)) {
				let log = logs.find(log => log.mapping === mapping && log.lineOffset + log.length + 1 === offset);
				if (log) {
					log.length++;
				}
				else {
					log = {
						mapping,
						line,
						lineOffset: offset,
						sourceOffset: sourceOffset,
						generatedOffset: offset,
						length: 0,
					};
					logs.push(log);
				}
			}
		}
		for (const log of logs.reverse()) {
			const sourcePosition = sourceFileDocument.positionAt(log.sourceOffset);
			const spanText = log.length === 0 ? '^' : '~'.repeat(log.length);
			const prefix = ' '.repeat(lineHead.length);
			const sourceLineEnd = sourceFileDocument.offsetAt({ line: sourcePosition.line + 1, character: 0 }) - 1;
			const sourceLine = sourceFileDocument.getText().substring(sourceFileDocument.offsetAt({ line: sourcePosition.line, character: 0 }), sourceLineEnd + 1);
			const sourceLineHead = `[${sourcePosition.line + 1}]`;
			yield [
				prefix,
				' '.repeat(log.lineOffset),
				spanText,
			].join(' ');
			if (log.line === sourceLine) {
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					sourceLineHead,
					'(exact match)',
					`(${':' + (sourcePosition.line + 1)
					+ ':' + (sourcePosition.character + 1)
					})`,
				].join(' ');
			}
			else {
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					sourceLineHead,
					normalizeLogText(sourceLine),
					`(${':' + (sourcePosition.line + 1)
					+ ':' + (sourcePosition.character + 1)})`,
				].join(' ');
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					' '.repeat(sourceLineHead.length),
					' '.repeat(sourcePosition.character) + spanText,
				].join(' ');
			}
		}
		lineOffset += line.length;
	}
}

function normalizeLogText(text: string) {
	return text
		.replace(/\t/g, '→')
		.replace(/\n/g, '↵')
		.replace(/ /g, '·');
}
