import type { BaseLanguageClient } from '@volar/vscode/node';
import { config } from '../config';
import type { vscode } from 'vscode_common/thirdPartForUse';
import * as doctor from './doctor';
import * as nameCasing from './nameCasing';
import * as splitEditors from './splitEditors';

export function activeFeatures(context: vscode.ExtensionContext, client: BaseLanguageClient,){

	const selectors = config.server.includeLanguages;
	nameCasing.activate(context, client, selectors);
	
	splitEditors.register(context, client);

	doctor.register(context, client);
}