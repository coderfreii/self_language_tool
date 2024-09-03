import { createLabsInfo } from '@volar/vscode';
import * as serverLib from '@volar/language-server/protocol';
import * as vscode from 'vscode';
import * as lsp from '@volar/vscode/node';
import { activate as commonActivate, deactivate as commonDeactivate } from './common';
import { config } from './config';
import { middleware } from './middleware';
import { forCompatible } from './common/compatible';

import * as volarLsp from '@volar/vscode';
import type { VueInitializationOptions } from '@vue/language-server/lib/types';
import { patch } from './patch';


export type CreateLanguageClient = (
	id: string,
	name: string,
	documentSelector: volarLsp.vscodeLanguageclient.DocumentSelector,
	initOptions: VueInitializationOptions,
	port: number,
	outputChannel: vscode.OutputChannel,
) => volarLsp.vscodeLanguageclient.BaseLanguageClient;


export async function activate(context: vscode.ExtensionContext) {

	const volarLabs = createLabsInfo(serverLib);

	await commonActivate(context, (
		id,
		name,
		documentSelector,
		initOptions,
		port,
		outputChannel
	) => {

		const client = createClient(id, name, documentSelector, initOptions, port, outputChannel, context);

		client.start();

		volarLabs.addLanguageClient(client);

		updateProviders(client);

		return client;
	});

	forCompatible.checkCompatible();

	return volarLabs.extensionExports;
}

export function deactivate(): Thenable<any> | undefined {
	return commonDeactivate();
}


function createClient(id: string,
	name: string,
	documentSelector: volarLsp.vscodeLanguageclient.DocumentSelector,
	initOptions: VueInitializationOptions,
	port: number,
	outputChannel: vscode.OutputChannel,
	context: vscode.ExtensionContext
) {
	class VueLanguageClient extends lsp.LanguageClient {
		fillInitializeParams(params: lsp.InitializeParams) {
			// fix https://github.com/vuejs/language-tools/issues/1959
			params.locale = vscode.env.language;
		}
	}

	let serverModule = vscode.Uri.joinPath(context.extensionUri, 'server.js');

	const runOptions: lsp.ForkOptions = {};
	if (config.server.maxOldSpaceSize) {
		runOptions.execArgv ??= [];
		runOptions.execArgv.push("--max-old-space-size=" + config.server.maxOldSpaceSize);
	}
	const debugOptions: lsp.ForkOptions = { execArgv: ['--nolazy', '--inspect=' + port] };
	const serverOptions: lsp.ServerOptions = {
		run: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: runOptions
		},
		debug: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: debugOptions
		},
	};
	const clientOptions: lsp.LanguageClientOptions = {
		middleware,
		documentSelector: documentSelector,
		initializationOptions: initOptions,
		markdown: {
			isTrusted: true,
			supportHtml: true,
		},
		outputChannel,
	};
	const client = new VueLanguageClient(
		id,
		name,
		serverOptions,
		clientOptions,
	);

	return client;
}

function updateProviders(client: lsp.LanguageClient) {

	const initializeFeatures = (client as any).initializeFeatures;

	(client as any).initializeFeatures = (...args: any) => {
		const capabilities = (client as any)._capabilities as lsp.ServerCapabilities;

		if (!config.codeActions.enabled) {
			capabilities.codeActionProvider = undefined;
		}
		if (!config.codeLens.enabled) {
			capabilities.codeLensProvider = undefined;
		}
		if (!config.updateImportsOnFileMove.enabled && capabilities.workspace?.fileOperations?.willRename) {
			capabilities.workspace.fileOperations.willRename = undefined;
		}

		return initializeFeatures.call(client, ...args);
	};
}


patch.patchTypescriptLanguageFeaturesExtention();