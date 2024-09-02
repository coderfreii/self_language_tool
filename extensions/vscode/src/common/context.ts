import { vscode } from "vscode_common/thirdPartForUse";
import { config } from "../config";
import { fs, path, semver } from "./thirdPartForUse";



function getCurrentHybridModeStatus(report = false) {

	const incompatibleExtensions: string[] = [];
	const unknownExtensions: string[] = [];

	for (const extension of vscode.extensions.all) {
		const compatible = isExtensionCompatibleWithHybridMode(extension);
		if (compatible === false) {
			incompatibleExtensions.push(extension.id);
		}
		else if (compatible === undefined) {
			const hasTsPlugin = !!extension.packageJSON?.contributes?.typescriptServerPlugins;
			if (hasTsPlugin) {
				unknownExtensions.push(extension.id);
			}
		}
	}

	if (config.server.hybridMode === 'typeScriptPluginOnly') {
		return false;
	}
	else if (config.server.hybridMode === 'auto') {
		if (incompatibleExtensions.length || unknownExtensions.length) {
			if (report) {
				vscode.window.showInformationMessage(
					`Hybrid Mode is disabled automatically because there is a potentially incompatible ${[...incompatibleExtensions, ...unknownExtensions].join(', ')} TypeScript plugin installed.`,
					'Open Settings',
					'Report a false positive',
				).then(value => {
					if (value === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'vue.server.hybridMode');
					}
					else if (value == 'Report a false positive') {
						vscode.env.openExternal(vscode.Uri.parse('https://github.com/vuejs/language-tools/pull/4206'));
					}
				});
			}
			return false;
		}
		const vscodeTsdkVersion = getVScodeTsdkVersion();
		const workspaceTsdkVersion = getWorkspaceTsdkVersion();
		if (
			(vscodeTsdkVersion && !semver.gte(vscodeTsdkVersion, '5.3.0'))
			|| (workspaceTsdkVersion && !semver.gte(workspaceTsdkVersion, '5.3.0'))
		) {
			if (report) {
				let msg = `Hybrid Mode is disabled automatically because TSDK >= 5.3.0 is required (VSCode TSDK: ${vscodeTsdkVersion}`;
				if (workspaceTsdkVersion) {
					msg += `, Workspace TSDK: ${workspaceTsdkVersion}`;
				}
				msg += `).`;
				vscode.window.showInformationMessage(msg, 'Open Settings').then(value => {
					if (value === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'vue.server.hybridMode');
					}
				});
			}
			return false;
		}
		return true;
	}
	else {
		if (config.server.hybridMode && incompatibleExtensions.length && report) {
			vscode.window.showWarningMessage(
				`You have explicitly enabled Hybrid Mode, but you have installed known incompatible extensions: ${incompatibleExtensions.join(', ')}. You may want to change vue.server.hybridMode to "auto" to avoid compatibility issues.`,
				'Open Settings',
				'Report a false positive',
			).then(value => {
				if (value === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'vue.server.hybridMode');
				}
				else if (value == 'Report a false positive') {
					vscode.env.openExternal(vscode.Uri.parse('https://github.com/vuejs/language-tools/pull/4206'));
				}
			});
		}
		return config.server.hybridMode;
	}

	function getVScodeTsdkVersion() {
		const nightly = vscode.extensions.getExtension('ms-vscode.vscode-typescript-next');
		if (nightly) {
			const libPath = path.join(
				nightly.extensionPath.replace(/\\/g, '/'),
				'node_modules/typescript/lib',
			);
			return getTsVersion(libPath);
		}

		if (vscode.env.appRoot) {
			const libPath = path.join(
				vscode.env.appRoot.replace(/\\/g, '/'),
				'extensions/node_modules/typescript/lib',
			);
			return getTsVersion(libPath);
		}
	}

	function getWorkspaceTsdkVersion() {
		const libPath = vscode.workspace.getConfiguration('typescript').get<string>('tsdk')?.replace(/\\/g, '/');
		if (libPath) {
			return getTsVersion(libPath);
		}
	}

	function getTsVersion(libPath: string): string | undefined {
		try {
			const p = libPath.toString().split('/');
			const p2 = p.slice(0, -1);
			const modulePath = p2.join('/');
			const filePath = modulePath + '/package.json';
			const contents = fs.readFileSync(filePath, 'utf-8');

			if (contents === undefined) {
				return;
			}

			let desc: any = null;
			try {
				desc = JSON.parse(contents);
			} catch (err) {
				return;
			}
			if (!desc || !desc.version) {
				return;
			}

			return desc.version;
		} catch { }
	}
}

function getCurrentTypeScriptPluginStatus() {
	return getCurrentHybridModeStatus() || config.server.hybridMode === 'typeScriptPluginOnly';
}

function isExtensionCompatibleWithHybridMode(extension: vscode.Extension<any>) {
	if (
		extension.id === 'Vue.volar'
		|| extension.id === 'unifiedjs.vscode-mdx'
		|| extension.id === 'astro-build.astro-vscode'
		|| extension.id === 'ije.esm-vscode'
		|| extension.id === 'johnsoncodehk.vscode-tsslint'
		|| extension.id === 'VisualStudioExptTeam.vscodeintellicode'
		|| extension.id === 'bierner.lit-html'
		|| extension.id === 'jenkey2011.string-highlight'
		|| extension.id === 'mxsdev.typescript-explorer'
		|| extension.id === 'miaonster.vscode-tsx-arrow-definition'
		|| extension.id === 'runem.lit-plugin'
		|| extension.id === 'kimuson.ts-type-expand'
	) {
		return true;
	}
	if (
		extension.id === 'styled-components.vscode-styled-components'
		|| extension.id === 'Divlo.vscode-styled-jsx-languageserver'
		|| extension.id === 'nrwl.angular-console'
	) {
		return false;
	}
	if (extension.id === 'denoland.vscode-deno') {
		return !vscode.workspace.getConfiguration('deno').get<boolean>('enable');
	}
	if (extension.id === 'svelte.svelte-vscode') {
		return semver.gte(extension.packageJSON.version, '108.4.0');
	}
}




export const appContext = {
	getCurrentTypeScriptPluginStatus,
	getCurrentHybridModeStatus,
}