import { SnapshotDocument } from "@volar/snapshot-document/lib/snapshotDocument";
import type { LazyHolder } from "../server";
import * as vscode from 'vscode-languageserver';
import { URI } from "vscode-uri";
import type { KeyType } from "@volar/language-service/lib/utils/uriMap";


const syncedDocumentParsedUriToUri = new Map<string, string>();

function setup(holder: LazyHolder) {

	const documents = new vscode.TextDocuments({
		create(uri, languageId, version, text) {
			return new SnapshotDocument(uri, languageId, version, text);
		},
		update(snapshot, contentChanges, version) {
			snapshot.update(contentChanges, version);
			return snapshot;
		},
	});

	documents.listen(holder.connection);
	documents.onDidOpen(({ document }) => {
		const parsedUri = URI.parse(document.uri);
		syncedDocumentParsedUriToUri.set(parsedUri.toString(), document.uri);
	});
	documents.onDidClose(e => {
		syncedDocumentParsedUriToUri.delete(URI.parse(e.document.uri).toString());
	});

	return {
		documents,
		getSyncedDocumentKey,
		getDocument
	};



	function getSyncedDocumentKey(uri: KeyType) {
		const originalUri = syncedDocumentParsedUriToUri.get(uri.toString());
		if (originalUri) {
			return originalUri;
		}
	}

	function getDocument(uri: KeyType) {
		const DocumentKey = getSyncedDocumentKey(uri);
		if (DocumentKey) {
			return documents.get(DocumentKey);
		}
		return undefined;
	}

}



export const documentsSetup = {
	setup
};