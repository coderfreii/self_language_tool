import { appContext } from "./common/context";
import { fs } from "./common/thirdPartForUse";
import { config } from "./config";
import { forCompatible } from "./common/compatible";




function patchTypescriptLanguageFeaturesExtention() {
	try {
		const tsExtension = forCompatible.tsExtension!;
		const readFileSync = fs.readFileSync;
		const extensionJsPath = require.resolve('./dist/extension.js', { paths: [tsExtension.extensionPath] });


		const enabledHybridMode = appContext.getCurrentHybridModeStatus();
		const enabledTypeScriptPlugin = appContext.getCurrentTypeScriptPluginStatus();

		const pluginName = "@vue/typescript-plugin"

		// @ts-expect-error
		fs.readFileSync = (...args) => {
			if (args[0] === extensionJsPath) {
				let text = readFileSync(...args) as string;

				if (!enabledTypeScriptPlugin) {
					text = text.replace(
						'for(const e of n.contributes.typescriptServerPlugins',
						s => s + `.filter(p=>p.name!=='${pluginName}')`
					);
				}
				else if (enabledHybridMode) {
					// patch readPlugins
					text = text.replace(
						'languages:Array.isArray(e.languages)',
						[
							'languages:',
							`e.name==='${pluginName}'?[${config.server.includeLanguages.map(lang => `"${lang}"`).join(',')}]`,
							':Array.isArray(e.languages)',
						].join(''),
					);

					// VSCode < 1.87.0
					text = text.replace('t.$u=[t.$r,t.$s,t.$p,t.$q]', s => s + '.concat("vue")'); // patch jsTsLanguageModes
					text = text.replace('.languages.match([t.$p,t.$q,t.$r,t.$s]', s => s + '.concat("vue")'); // patch isSupportedLanguageMode

					// VSCode >= 1.87.0
					text = text.replace('t.jsTsLanguageModes=[t.javascript,t.javascriptreact,t.typescript,t.typescriptreact]', s => s + '.concat("vue")'); // patch jsTsLanguageModes
					text = text.replace('.languages.match([t.typescript,t.typescriptreact,t.javascript,t.javascriptreact]', s => s + '.concat("vue")'); // patch isSupportedLanguageMode
				}

				return text;
			}
			return readFileSync(...args);
		};
	} catch { }
}



export const patch = {
	patchTypescriptLanguageFeaturesExtention
};