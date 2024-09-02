import { vscode } from "vscode_common";


const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
const vueTsPluginExtension = vscode.extensions.getExtension('Vue.vscode-typescript-vue-plugin');

async function checkCompatible() {


	if (tsExtension) {
		await tsExtension.activate();
	}
	else {
		vscode.window.showWarningMessage(
			'Takeover mode is no longer needed since v2. Please enable the "TypeScript and JavaScript Language Features" extension.',
			'Show Extension'
		).then(selected => {
			if (selected) {
				vscode.commands.executeCommand('workbench.extensions.search', '@builtin typescript-language-features');
			}
		});
	}

	if (vueTsPluginExtension) {
		vscode.window.showWarningMessage(
			`The "${vueTsPluginExtension.packageJSON.displayName}" extension is no longer needed since v2. Please uninstall it.`,
			'Show Extension'
		).then(selected => {
			if (selected) {
				vscode.commands.executeCommand('workbench.extensions.search', vueTsPluginExtension.id);
			}
		});
	}
}


export const forCompatible = {
	tsExtension,
	vueTsPluginExtension,
	checkCompatible
};