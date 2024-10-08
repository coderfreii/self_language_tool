import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { DataTransferItem, LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: LanguageServiceContext) {

	return (uri: URI, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			["provideDocumentDropEdits"],
			context,
			uri,
			() => position,
			function* (map) {
				for (const mappedPosition of map.getGeneratedPositions(position)) {
					yield mappedPosition;
				}
			},
			(plugin, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideDocumentDropEdits?.(document, arg, dataTransfer, token);
			},
			edit => {
				if (edit.additionalEdit) {
					edit.additionalEdit = transformWorkspaceEdit(
						edit.additionalEdit,
						context,
						undefined
					);
				}
				return edit;
			}
		);
	};
}
