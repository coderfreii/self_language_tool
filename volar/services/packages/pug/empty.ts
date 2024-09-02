// import type { LanguageServicePlugin } from '@volar/language-service';

import type { LanguageServicePlugin } from "@volar/language-service/lib/types";

console.warn('[volar-service-pug] this module is not yet supported for web.');

export function create(): LanguageServicePlugin {
	return {
		name: 'pug (stub)',
		capabilities: {},
		create() {
			return {};
		},
	};
}
