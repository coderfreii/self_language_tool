import type { URI } from 'vscode-uri';

export type UriMap<T, K extends KeyType = URI> = ReturnType<typeof createUriMap<T, K>>;

export type KeyType = { toString(skipEncoding?: boolean): string; };

export function createUriMap<V, K extends KeyType = URI>(caseSensitive = false): Map<K, V> {
	const map = new Map<string, V>();
	const rawUriToNormalizedUri = new Map<string, string>();
	const normalizedUriToRawUri = new Map<string, K>();

	return {
		get size() {
			return map.size;
		},
		get [Symbol.toStringTag]() {
			return 'UriMap';
		},
		[Symbol.iterator]() {
			return this.entries();
		},
		clear() {
			rawUriToNormalizedUri.clear();
			normalizedUriToRawUri.clear();
			return map.clear();
		},
		values() {
			return map.values();
		},
		*keys() {
			for (const normalizedUri of map.keys()) {
				yield normalizedUriToRawUri.get(normalizedUri)!;
			}
		},
		*entries() {
			for (const [normalizedUri, item] of map.entries()) {
				yield [normalizedUriToRawUri.get(normalizedUri)!, item] as const;
			}
		},
		forEach(callbackfn, thisArg) {
			for (const [uri, item] of this.entries()) {
				callbackfn.call(thisArg, item, uri, this);
			}
		},
		delete(uri) {
			return map.delete(toKey(uri));
		},
		get(uri) {
			return map.get(toKey(uri));
		},
		has(uri) {
			return map.has(toKey(uri));
		},
		set(uri, item) {
			map.set(toKey(uri), item);
			return this;
		},
	};

	function toKey(uri: K) {
		const rawUri = uri.toString();
		if (!rawUriToNormalizedUri.has(rawUri)) {
			let normalizedUri = uri.toString();
			if (!caseSensitive) {
				normalizedUri = normalizedUri.toLowerCase();
			}
			rawUriToNormalizedUri.set(rawUri, normalizedUri);
			normalizedUriToRawUri.set(normalizedUri, uri);
		}
		return rawUriToNormalizedUri.get(rawUri)!;
	}
}
