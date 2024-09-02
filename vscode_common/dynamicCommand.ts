import { vscode } from "./thirdPartForUse";



// 定义动态命令列表
function DynamicCommand() {
	const _self = {
		_dynamicCommands: [] as CommandJSON[],
		_enabled: false as boolean,
		isEnabled() {
			return this._enabled;
		},
		setEnabled(enabled: boolean) {
			this._enabled = enabled;
		},
		checkEnabled() {
			if (!this.isEnabled()) throw Error("must enable first");
		}
	};


	function enable(context: vscode.ExtensionContext) {
		if (_self.isEnabled()) return;
		// 注册一个静态命令
		const disposable = vscode.commands.registerCommand(
			"vue.action.showDynamicCommands",
			async () => {
				// 显示快速选择器
				const selectedCommand = await vscode.window.showQuickPick(
					_self._dynamicCommands,
					{
						placeHolder: "Select a command to execute",
					}
				);

				if (selectedCommand) {
					// 执行选定的动态命令
					vscode.commands.executeCommand(selectedCommand.command);
				}
			}
		);
		context.subscriptions.push(disposable);
		_self.setEnabled(true);
	}

	function register(
		context: vscode.ExtensionContext,
		command: CommandJSON,
		callback: (...args: any[]) => any
	) {
		_self.checkEnabled();
		_self._dynamicCommands.push(command);
		// 动态注册命令
		context.subscriptions.push(
			vscode.commands.registerCommand(command.command, callback)
		);
	}

	return {
		enable,
		register
	};
}


export const vscodeLibs = {
	dynamicCommands: DynamicCommand()
};


type CommandJSON = {
	command: string;
	label: string;
};


export type {
	CommandJSON,
};