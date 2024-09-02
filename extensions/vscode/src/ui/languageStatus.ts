import { configSection } from "../common/const";
import { appContext } from "../common/context";
import { vscode } from "vscode_common/thirdPartForUse";
import { config } from "../config";
import { quickPick } from '@volar/vscode/lib/common';
import { vscodeWrapper } from 'vscode_common'


function setUphybridModeStatus(selectors: vscode.DocumentSelector) {
	const enabledHybridMode = appContext.getCurrentHybridModeStatus();

	//UI
	const hybridModeStatus = vscodeWrapper.createLanguageStatusItem('vue-hybrid-mode', selectors);
	hybridModeStatus.text = 'Hybrid Mode';
	hybridModeStatus.detail = (enabledHybridMode ? 'Enabled' : 'Disabled') + (config.server.hybridMode === 'auto' ? ' (Auto)' : '');
	hybridModeStatus.command = {
		title: 'Open Setting',
		command: 'workbench.action.openSettings',
		arguments: [configSection.hybridMode],
	};
	if (!enabledHybridMode) {
		hybridModeStatus.severity = vscode.LanguageStatusSeverity.Warning;
	}
}

async function setupInsider(context: vscode.ExtensionContext) {
	const item = vscodeWrapper.createLanguageStatusItem('vue-insider', 'vue');
	if (!context.extension.packageJSON.version.includes('-insider')) {
		item.text = '✨ Get Insiders Edition';
		item.severity = vscode.LanguageStatusSeverity.Warning;
	}
	else {
		item.text = '🚀 Insiders Edition';
	}
	item.detail = 'Checking for Updates...';
	item.busy = true;
	fetch('https://raw.githubusercontent.com/vuejs/language-tools/HEAD/insiders.json')
		.then(res => res.json())
		.then((json: {
			latest: string;
			versions: {
				version: string;
				date: string;
				downloads: {
					GitHub: string;
					AFDIAN: string;
				};
			}[];
		}) => {
			item.detail = undefined;
			item.command = {
				title: 'Select Version',
				command: 'vue-insiders.update',
			};
			if (
				json.versions.some(version => version.version === context.extension.packageJSON.version)
				&& context.extension.packageJSON.version !== json.latest
			) {
				item.detail = 'New Version Available!';
				item.severity = vscode.LanguageStatusSeverity.Warning;
			}
			vscode.commands.registerCommand('vue-insiders.update', async () => {
				const quickPickItems: { [version: string]: vscode.QuickPickItem; } = {};
				for (const { version, date } of json.versions) {
					let description = date;
					if (context.extension.packageJSON.version === version) {
						description += ' (current)';
					}
					quickPickItems[version] = {
						label: version,
						description,
					};
				}
				const version = await quickPick([quickPickItems, {
					learnMore: {
						label: 'Learn more about Insiders Edition',
					},
					joinViaGitHub: {
						label: 'Join via GitHub Sponsors',
					},
					joinViaAFDIAN: {
						label: 'Join via AFDIAN (爱发电)',
					},
				}]);
				if (version === 'learnMore') {
					vscode.env.openExternal(vscode.Uri.parse('https://github.com/vuejs/language-tools/wiki/Get-Insiders-Edition'));
				}
				else if (version === 'joinViaGitHub') {
					vscode.env.openExternal(vscode.Uri.parse('https://github.com/sponsors/johnsoncodehk'));
				}
				else if (version === 'joinViaAFDIAN') {
					vscode.env.openExternal(vscode.Uri.parse('https://afdian.net/a/johnsoncodehk'));
				}
				else {
					const downloads = json.versions.find(v => v.version === version)?.downloads;
					if (downloads) {
						const quickPickItems: { [key: string]: vscode.QuickPickItem; } = {
							GitHub: {
								label: `${version} - GitHub Releases`,
								description: 'Access via GitHub Sponsors',
								detail: downloads.GitHub,
							},
							AFDIAN: {
								label: `${version} - Insiders 电圈`,
								description: 'Access via AFDIAN (爱发电)',
								detail: downloads.AFDIAN,
							},
						};
						const otherItems: { [key: string]: vscode.QuickPickItem; } = {
							learnMore: {
								label: 'Learn more about Insiders Edition',
							},
							joinViaGitHub: {
								label: 'Join via GitHub Sponsors',
							},
							joinViaAFDIAN: {
								label: 'Join via AFDIAN (爱发电)',
							},
						};
						const option = await quickPick([quickPickItems, otherItems]);
						if (option === 'learnMore') {
							vscode.env.openExternal(vscode.Uri.parse('https://github.com/vuejs/language-tools/wiki/Get-Insiders-Edition'));
						}
						else if (option === 'joinViaGitHub') {
							vscode.env.openExternal(vscode.Uri.parse('https://github.com/sponsors/johnsoncodehk'));
						}
						else if (option === 'joinViaAFDIAN') {
							vscode.env.openExternal(vscode.Uri.parse('https://afdian.net/a/johnsoncodehk'));
						}
						else if (option) {
							vscode.env.openExternal(vscode.Uri.parse(downloads[option as keyof typeof downloads]));
						}
					}
				}
			});
		})
		.catch(() => {
			item.detail = 'Failed to Fetch Versions';
			item.severity = vscode.LanguageStatusSeverity.Warning;
		})
		.finally(() => {
			item.busy = false;
		});
}


export const UI = {
	setUphybridModeStatus,
	setupInsider
};

