import { vscode } from "./thirdPartForUse";

 function operateContext(...anyElse: Parameters<typeof vscode.commands.executeCommand>[1]) {
	return vscode.commands.executeCommand('setContext', ...anyElse);
}

 function createLanguageStatusItem(id: Parameters<typeof vscode.languages.createLanguageStatusItem>[0], selector: Parameters<typeof vscode.languages.createLanguageStatusItem>[1]) {
	return vscode.languages.createLanguageStatusItem(id, selector);
}


 async function requestReloadVscode(msg: string) {
	const reload = await vscode.window.showInformationMessage(msg, 'Reload Window');
	if (reload === undefined) {
		return; // cancel
	}
	vscode.commands.executeCommand('workbench.action.reloadWindow');
}




export const vscodeWrapper = {
	operateContext,
	createLanguageStatusItem,
	requestReloadVscode
}