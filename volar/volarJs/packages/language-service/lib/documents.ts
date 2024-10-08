// import { CodeInformation, CodeRangeKey, LinkedCodeMap, Mapping, SourceMap, VirtualCode, translateOffset } from '@volar/language-core';
import type { LinkedCodeMap } from '@volar/language-core/lib/linkedCodeMap';
import type { CodeInformation, VirtualCode } from '@volar/language-core/lib/types';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type SourceMap, type Mapping, type CodeRangeKey, translateOffset } from '@volar/source-map';

export class SourceMapWithDocuments {

	constructor(
		public sourceDocument: TextDocument,
		public embeddedDocument: TextDocument,
		public map: SourceMap<CodeInformation>,
		public virtualCode?: VirtualCode,
	) { }

	// Range APIs

	public getSourceRange(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.getSourceRanges(range, filter)) {
			return result;
		}
	}

	public getGeneratedRange(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.getGeneratedRanges(range, filter)) {
			return result;
		}
	}

	public * getSourceRanges(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, 'getSourcePositionsBase', 'matchSourcePosition')) {
			yield result;
		}
	}

	public * getGeneratedRanges(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, 'getGeneratedPositionsBase', 'matchGeneratedPosition')) {
			yield result;
		}
	}

	protected * findRanges(
		range: vscode.Range,
		filter: (data: CodeInformation) => boolean,
		api: 'getSourcePositionsBase' | 'getGeneratedPositionsBase',
		api2: 'matchSourcePosition' | 'matchGeneratedPosition'
	) {
		const failedLookUps: (readonly [vscode.Position, Mapping<CodeInformation>])[] = [];
		for (const mapped of this[api](range.start, filter)) {
			const end = this[api2](range.end, mapped[1]);
			if (end) {
				yield { start: mapped[0], end } as vscode.Range;
			}
			else {
				failedLookUps.push(mapped);
			}
		}
		for (const failedLookUp of failedLookUps) {
			for (const mapped of this[api](range.end, filter)) {
				yield { start: failedLookUp[0], end: mapped[0] } as vscode.Range;
			}
		}
	}

	// Position APIs

	public getSourcePosition(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.getSourcePositions(position, filter)) {
			return mapped;
		}
	}

	public getGeneratedPosition(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.getGeneratedPositions(position, filter)) {
			return mapped;
		}
	}

	public * getSourcePositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.getSourcePositionsBase(position, filter)) {
			yield mapped[0];
		}
	}

	public * getGeneratedPositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.getGeneratedPositionsBase(position, filter)) {
			yield mapped[0];
		}
	}

	public * getSourcePositionsBase(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.embeddedDocument, this.sourceDocument, 'generatedOffsets', 'sourceOffsets')) {
			yield mapped;
		}
	}

	public * getGeneratedPositionsBase(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.sourceDocument, this.embeddedDocument, 'sourceOffsets', 'generatedOffsets')) {
			yield mapped;
		}
	}

	protected * findPositions(
		position: vscode.Position,
		filter: (data: CodeInformation) => boolean,
		fromDoc: TextDocument,
		toDoc: TextDocument,
		from: CodeRangeKey,
		to: CodeRangeKey
	) {
		for (const mapped of this.map.findMatching(fromDoc.offsetAt(position), from, to)) {
			if (!filter(mapped[1].data)) {
				continue;
			}
			yield [toDoc.positionAt(mapped[0]), mapped[1]] as const;
		}
	}

	protected matchSourcePosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.embeddedDocument.offsetAt(position), mapping.generatedOffsets, mapping.sourceOffsets, mapping.generatedLengths ?? mapping.lengths, mapping.lengths);
		if (offset !== undefined) {
			return this.sourceDocument.positionAt(offset);
		}
	}

	protected matchGeneratedPosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.sourceDocument.offsetAt(position), mapping.sourceOffsets, mapping.generatedOffsets, mapping.lengths, mapping.generatedLengths ?? mapping.lengths);
		if (offset !== undefined) {
			return this.embeddedDocument.positionAt(offset);
		}
	}
}

export class LinkedCodeMapWithDocument extends SourceMapWithDocuments {
	constructor(
		public document: TextDocument,
		public linkedMap: LinkedCodeMap,
		public virtualCode: VirtualCode,
	) {
		super(document, document, linkedMap, virtualCode);
	}
	*getLinkedCodePositions(posotion: vscode.Position) {
		for (const linkedPosition of this.linkedMap.getLinkedOffsets(this.document.offsetAt(posotion))) {
			yield this.document.positionAt(linkedPosition);
		}
	}
}
