import * as volarLsp from '@volar/vscode';
import type { VueInitializationOptions } from '@vue/language-server/lib/types';
import * as vscode from 'vscode';
import { config } from './config';
import { vscodeLibs } from 'vscode_common/dynamicCommand';
import { activeFeatures } from './features';
import { UI } from './ui/languageStatus';
import { appContext } from './common/context';
import { configSection } from './common/const';
import { vscodeWrapper } from 'vscode_common';
import type { CreateLanguageClient } from './main';

let client: volarLsp.vscodeLanguageclient.BaseLanguageClient;



export async function activate(context: vscode.ExtensionContext, createLc: CreateLanguageClient) {
	const stopCheck = vscode.window.onDidChangeActiveTextEditor(tryActivate);
	tryActivate();

	function tryActivate() {
		if (vscode.window.visibleTextEditors.some(editor => config.server.includeLanguages.includes(editor.document.languageId))) {
			doActivate(context, createLc);
			stopCheck.dispose();
		}
	}
}


async function doActivate(context: vscode.ExtensionContext, createLanguageClient: CreateLanguageClient) {
	vscodeLibs.dynamicCommands.enable(context)

	vscodeWrapper.operateContext( 'vue.activated', true);

	const enabledHybridMode = appContext.getCurrentHybridModeStatus(true);

	vscodeWrapper.operateContext('vueHybridMode', enabledHybridMode);

	const enabledTypeScriptPlugin = appContext.getCurrentTypeScriptPluginStatus();

	const outputChannel = vscode.window.createOutputChannel('Vue Language Server');

	const selectors = config.server.includeLanguages;


	client = createLanguageClient(
		'vue',
		'Vue',
		selectors,
		await getInitializationOptions(context, enabledHybridMode),
		7009,
		outputChannel
	);


	activateConfigWatcher();

	activateRestartCommand();

	activeFeatures(context, client);

	activeVolarFeature();


	//UI
	UI.setUphybridModeStatus(selectors);
	await UI.setupInsider(context);

	function activateConfigWatcher() {
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(configSection.vueServer)) {
				if (e.affectsConfiguration(configSection.hybridMode)) {
					const newHybridModeStatus = appContext.getCurrentHybridModeStatus();
					const newTypeScriptPluginStatus = appContext.getCurrentTypeScriptPluginStatus();
					if (newHybridModeStatus !== enabledHybridMode) {
						vscodeWrapper.requestReloadVscode(
							newHybridModeStatus
								? 'Please reload VSCode to enable Hybrid Mode.'
								: 'Please reload VSCode to disable Hybrid Mode.'
						);
					}
					else if (newTypeScriptPluginStatus !== enabledTypeScriptPlugin) {
						vscodeWrapper.requestReloadVscode(
							newTypeScriptPluginStatus
								? 'Please reload VSCode to enable Vue TypeScript Plugin.'
								: 'Please reload VSCode to disable Vue TypeScript Plugin.'
						);
					}
				}
				else if (enabledHybridMode) {
					if (e.affectsConfiguration(configSection.includeLanguages)) {
						vscodeWrapper.requestReloadVscode('Please reload VSCode to apply the new language settings.');
					}
				}
				else {
					vscode.commands.executeCommand('vue.action.restartServer', false);
				}
			}
			else if (e.affectsConfiguration('vue')) {
				vscode.commands.executeCommand('vue.action.restartServer', false);
			}
		}));
	}

	async function activateRestartCommand() {
		vscodeLibs.dynamicCommands.register(context, { label: "Restart Vue and TS servers", command: 'vue.action.restartServer' }
			, async (restartTsServer: boolean = true) => {
				if (restartTsServer) {
					await vscode.commands.executeCommand('typescript.restartTsServer');
				}
				await client.stop();
				outputChannel.clear();
				client.clientOptions.initializationOptions = await getInitializationOptions(context, enabledHybridMode);
				await client.start();
				activeFeatures(context, client);
			});			
	}

	function activeVolarFeature() {
		volarLsp.activateAutoInsertion(selectors, client);
		volarLsp.activateDocumentDropEdit(selectors, client);
		volarLsp.activateWriteVirtualFiles('vue.action.writeVirtualFiles', client);
		volarLsp.activateServerSys(client);

		if (!enabledHybridMode) {
			volarLsp.activateTsConfigStatusItem(selectors, 'vue.tsconfig', client);
			volarLsp.activateTsVersionStatusItem(selectors, 'vue.tsversion', context, text => 'TS ' + text);
			volarLsp.activateFindFileReferences('vue.findAllFileReferences', client);
		}
	}
}



export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}

async function getInitializationOptions(
	context: vscode.ExtensionContext,
	hybridMode: boolean,
): Promise<VueInitializationOptions> {
	return {
		typescript: { tsdk: (await volarLsp.getTsdk(context))!.tsdk },
		vue: {
			hybridMode,
		},
	};
};

