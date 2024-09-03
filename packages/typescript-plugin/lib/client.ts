import type { Request } from './server';
import { connect, searchNamedPipeServerForFile, sendRequestWorker } from './utils';

import { collectExtractProps as _collectExtractProps } from './requests/collectExtractProps';
import { getImportPathForFile as _getImportPathForFile } from './requests/getImportPathForFile';
import { getPropertiesAtLocation as _getPropertiesAtLocation } from './requests/getPropertiesAtLocation';
import { getQuickInfoAtPosition as _getQuickInfoAtPosition } from './requests/getQuickInfoAtPosition';
import {
	getComponentProps as _getComponentProps, getComponentEvents as _getComponentEvents, getTemplateContextProps as _getTemplateContextProps
	, getComponentNames as _getComponentNames, getElementAttrs as _getElementAttrs
} from './requests/componentInfos';

export function collectExtractProps(
	...args: Parameters<typeof _collectExtractProps>
) {
	return sendRequest<ReturnType<typeof _collectExtractProps>>({
		type: 'collectExtractProps',
		args,
	});
}

export async function getImportPathForFile(
	...args: Parameters<typeof _getImportPathForFile>
) {
	return await sendRequest<ReturnType<typeof _getImportPathForFile>>({
		type: 'getImportPathForFile',
		args,
	});
}

export async function getPropertiesAtLocation(
	...args: Parameters<typeof _getPropertiesAtLocation>
) {
	return await sendRequest<ReturnType<typeof _getPropertiesAtLocation>>({
		type: 'getPropertiesAtLocation',
		args,
	});
}

export function getQuickInfoAtPosition(
	...args: Parameters<typeof _getQuickInfoAtPosition>
) {
	return sendRequest<ReturnType<typeof _getQuickInfoAtPosition>>({
		type: 'getQuickInfoAtPosition',
		args,
	});
}

// Component Infos

export function getComponentProps(
	...args: Parameters<typeof _getComponentProps>
) {
	return sendRequest<ReturnType<typeof _getComponentProps>>({
		type: 'getComponentProps',
		args,
	});
}

export function getComponentEvents(
	...args: Parameters<typeof _getComponentEvents>
) {
	return sendRequest<ReturnType<typeof _getComponentEvents>>({
		type: 'getComponentEvents',
		args,
	});
}

export function getTemplateContextProps(
	...args: Parameters<typeof _getTemplateContextProps>
) {
	return sendRequest<ReturnType<typeof _getTemplateContextProps>>({
		type: 'getTemplateContextProps',
		args,
	});
}

export function getComponentNames(
	...args: Parameters<typeof _getComponentNames>
) {
	return sendRequest<ReturnType<typeof _getComponentNames>>({
		type: 'getComponentNames',
		args,
	});
}

export function getElementAttrs(
	...args: Parameters<typeof _getElementAttrs>
) {
	return sendRequest<ReturnType<typeof _getElementAttrs>>({
		type: 'getElementAttrs',
		args,
	});
}

async function sendRequest<T>(request: Request) {
	const server = (await searchNamedPipeServerForFile(request.args[0]))?.server;
	if (!server) {
		console.warn('[Vue Named Pipe Client] No server found for', request.args[0]);
		return;
	}
	const client = await connect(server.path);
	if (!client) {
		console.warn('[Vue Named Pipe Client] Failed to connect to', server.path);
		return;
	}
	return await sendRequestWorker<T>(request, client);
}
