'use strict';

import * as vscode from 'vscode';
import path = require('path');
import { OSCHoverProvider } from './oscHoverProvider';
import { OSCCompletionItemProvider } from './oscCompletionItemProvider';
import { OSCDefinitionProvider } from './oscDefinitionProvider';
import { OSCReferenceProvider } from './oscReferenceProvider';
import { OSCFoldingRangeProvider } from './oscFoldingRangeProvider';
import { symbolCache } from './symbolCache';
import { GraphDrawing } from './graphDrawing';
import { OSCDiagnostics } from './oscDiagnostics';

export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;

    context.subscriptions.push(vscode.languages.registerHoverProvider('opensmileconf', new OSCHoverProvider()));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('opensmileconf', new OSCCompletionItemProvider(), '.', ':', '=', ' '));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('opensmileconf', new OSCDefinitionProvider()));
    context.subscriptions.push(vscode.languages.registerReferenceProvider('opensmileconf', new OSCReferenceProvider()));
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('opensmileconf', new OSCFoldingRangeProvider()));
    context.subscriptions.push(vscode.commands.registerCommand('opensmile-config-files.showGraph', showGraphCommand));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument));

    loadSymbolCache();
}

export function deactivate() {
}

function onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
    if (e.affectsConfiguration('opensmile-config-files')) {
        loadSymbolCache();
    }
}

function onDidOpenTextDocument(document: vscode.TextDocument) {
    if (document.languageId === 'opensmileconf') {
        OSCDiagnostics.apply(document);
    }
}

function onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    if (e.document.languageId === 'opensmileconf') {
        OSCDiagnostics.apply(e.document);
    }
}

function loadSymbolCache() {
    let symbolsPath = vscode.workspace.getConfiguration('opensmile-config-files')['symbolsPath'];

    if (!path.isAbsolute(symbolsPath)) {
        symbolsPath = extensionContext.asAbsolutePath(symbolsPath);
    }

    symbolCache.clear();

    try {
        symbolCache.loadFromJson(symbolsPath);
    } catch (e) {
        vscode.window.showErrorMessage('Error loading symbols file. Make sure that the path in the extension configuration is valid. ' +
            'This extension will not work correctly until the path is set correctly.');
    }
}

function showGraphCommand(args?: any) {
    new GraphDrawing().showGraph();
}