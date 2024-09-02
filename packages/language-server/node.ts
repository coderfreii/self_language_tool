import { createServerWithConnection, loadTsdkByPath } from '@volar/language-server/node';
import { ParsedCommandLine, VueCompilerOptions, createParsedCommandLineWithVueOptions, createVueLanguagePlugin, parse, resolveVueCompilerOptions } from '@vue/language-core';
import { LanguageServiceEnvironment, convertAttrName, convertTagName, createDefaultGetTsPluginClient, detect, getVueLanguageServicePlugins, type TsPluginClientProvider, type VueCompilerOptionsProvider } from '@vue/language-service';
import * as tsPluginClient from '@vue/typescript-plugin/lib/client';
import { searchNamedPipeServerForFile } from '@vue/typescript-plugin/lib/utils';
import { URI } from 'vscode-uri';
import { GetLanguagePlugin, createHybridModeProjectFacade } from './lib/hybridModeProject';
import { DetectNameCasingRequest, GetConnectedNamedPipeServerRequest, GetConvertAttrCasingEditsRequest, GetConvertTagCasingEditsRequest, ParseSFCRequest } from './lib/protocol';
import type { VueInitializationOptions } from './lib/types';
import { createTypeScriptProjectFacade, type LanguagePluginProvider } from '@volar/language-server/lib/project/typescriptProjectFacade';
import { FileMap } from '@volar/language-core/lib/utils';





let tsdk: ReturnType<typeof loadTsdkByPath>;
let hybridMode: boolean;
let tsPluginClientProvider: TsPluginClientProvider;

const envToVueOptions = new WeakMap<LanguageServiceEnvironment, VueCompilerOptions>();

const vueCompilerOptionsProvider: VueCompilerOptionsProvider = env => envToVueOptions.get(env)!;

const languagePluginsProvider: LanguagePluginProvider = (env, ctx) => getLanguagePlugins({
	serviceEnv: env,
	configFileName: ctx.configFileName,
	projectHost: ctx.languageServiceHost,
	sys: ctx.sys,
	asFileName: ctx.asFileName,
});

const watchedExtensions = new Set<string>();



const server = createServerWithConnection();

server.start();

server.onInitialize(params => {
	const options: VueInitializationOptions = params.initializationOptions;

	hybridMode = options.vue?.hybridMode ?? true;

	tsdk = loadTsdkByPath(options.typescript.tsdk, params.locale);

	tsPluginClientProvider = resolveTsPlugin();

	const plugins = getVueLanguageServicePlugins(
		tsdk.typescript,
		vueCompilerOptionsProvider,
		tsPluginClientProvider,
		hybridMode,
	);

	const projectFacade = hybridMode
		? createHybridModeProjectFacade(server, tsdk.typescript.sys, getLanguagePlugins)
		: createTypeScriptProjectFacade(
			server,
			tsdk.typescript,
			tsdk.diagnosticMessages,
			languagePluginsProvider
		);


	return {
		languageServicePlugins: plugins, projectFacade, options: {
			pullModelDiagnostics: hybridMode,
		}
	};
});



server.connection.onRequest(ParseSFCRequest.type, params => {
	return parse(params);
});

server.connection.onRequest(DetectNameCasingRequest.type, async params => {
	const uri = URI.parse(params.textDocument.uri);
	const languageService = await getService(uri);
	if (languageService) {
		return await detect(languageService.context, uri);
	}
});

server.connection.onRequest(GetConvertTagCasingEditsRequest.type, async params => {
	const uri = URI.parse(params.textDocument.uri);
	const languageService = await getService(uri);
	if (languageService) {
		return await convertTagName(languageService.context, uri, params.casing, tsPluginClientProvider(languageService.context));
	}
});

server.connection.onRequest(GetConvertAttrCasingEditsRequest.type, async params => {
	const uri = URI.parse(params.textDocument.uri);
	const languageService = await getService(uri);
	if (languageService) {
		return await convertAttrName(languageService.context, uri, params.casing, tsPluginClientProvider(languageService.context));
	}
});

server.connection.onRequest(GetConnectedNamedPipeServerRequest.type, async fileName => {
	const server = (await searchNamedPipeServerForFile(fileName))?.server;
	if (server) {
		return server;
	}
});

async function getService(uri: URI) {
	return (await server.projectFacade.reolveLanguageServiceByUri(uri));
}


const getLanguagePlugins: GetLanguagePlugin<URI> = async ({ serviceEnv, configFileName, projectHost, sys, asFileName }) => {
	const commandLine = await parseCommandLine();
	const vueOptions = commandLine?.vueOptions ?? resolveVueCompilerOptions({});
	const vueLanguagePlugin = createVueLanguagePlugin(
		tsdk.typescript,
		asFileName,
		() => projectHost?.getProjectVersion?.() ?? '',
		fileName => {
			const fileMap = new FileMap(sys?.useCaseSensitiveFileNames ?? false);
			for (const vueFileName of projectHost?.getScriptFileNames() ?? []) {
				fileMap.set(vueFileName, undefined);
			}
			return fileMap.has(fileName);
		},
		commandLine?.options ?? {},
		vueOptions
	);
	if (!hybridMode) {
		const extensions = [
			'js', 'cjs', 'mjs', 'ts', 'cts', 'mts', 'jsx', 'tsx', 'json',
			...vueOptions.extensions.map(ext => ext.slice(1)),
			...vueOptions.vitePressExtensions.map(ext => ext.slice(1)),
			...vueOptions.petiteVueExtensions.map(ext => ext.slice(1)),
		];
		const newExtensions = extensions.filter(ext => !watchedExtensions.has(ext));
		if (newExtensions.length) {
			for (const ext of newExtensions) {
				watchedExtensions.add(ext);
			}
			server.filerWatcher.watchFiles(['**/*.{' + newExtensions.join(',') + '}']);
		}
	}

	envToVueOptions.set(serviceEnv, vueOptions);

	return [vueLanguagePlugin];

	async function parseCommandLine() {
		let commandLine: ParsedCommandLine | undefined;
		let sysVersion: number | undefined;
		if (sys) {
			let newSysVersion = await sys.sync();
			while (sysVersion !== newSysVersion) {
				sysVersion = newSysVersion;
				if (configFileName) {
					commandLine = createParsedCommandLineWithVueOptions(tsdk.typescript, sys, configFileName);
				}
				newSysVersion = await sys.sync();
			}
		}
		return commandLine;
	}
};



function resolveTsPlugin() {
	if (hybridMode) {
		return () => tsPluginClient;
	}
	else {
		return createDefaultGetTsPluginClient(tsdk.typescript);
	}
}

