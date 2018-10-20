import * as vscode from 'vscode';
import { TextDocument } from 'vscode';
import fs = require('fs');
import path = require('path');
import dagre = require('dagre');
import { configParser, SectionHeaderContext, Component } from './configParser';
import { extensionContext } from './extension';
import { symbolCache } from './symbolCache';

export class GraphDrawing {
    public async showGraph(): Promise<void> {
        let textEditor = vscode.window.activeTextEditor;
        if (!textEditor || textEditor.document.languageId !== 'opensmileconf') {
            await vscode.window.showErrorMessage('To run this command, an openSMILE configuration file must be loaded in the active editor.');
            return;
        }        
        
        let graph: dagre.graphlib.Graph | undefined;        
        let graphPromise: Promise<dagre.graphlib.Graph> = this.buildGraph(textEditor.document);

        let title: string;
        if (!textEditor.document.isUntitled) {
            title = `openSMILE component graph (${path.basename(textEditor.document.fileName)})`;
        } else {
            title = 'openSMILE component graph';
        }
        let webviewPanel = vscode.window.createWebviewPanel('opensmileConfGraph', title, vscode.ViewColumn.Three, { 
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(extensionContext.extensionPath)]
        });

        webviewPanel.webview.onDidReceiveMessage(async message => {
            if (message.id === 'pageLoaded') {
                graph = await graphPromise;
                let graphJson = dagre.graphlib.json.write(graph);
                webviewPanel.webview.postMessage({
                    id: 'showGraph',
                    graph: graphJson
                });
            } else if (message.id === 'nodeClicked') {
                let node = (graph as dagre.graphlib.Graph).node(message.nodeName);
                if (node.class === 'component') {
                    let definitionLocation: SectionHeaderContext = node.definitionLocation;
                    vscode.window.showTextDocument(definitionLocation.document, { 
                        viewColumn: (textEditor as vscode.TextEditor).viewColumn,
                        selection: definitionLocation.componentInstanceRange,
                        preserveFocus: true, 
                        preview: true
                    });
                }
            }
        }, undefined, extensionContext.subscriptions);

        let s: string = fs.readFileSync(extensionContext.asAbsolutePath('assets/graph.htm'), 'utf8');

        let d3ResourcePath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'assets', 'd3.v4.min.js')).with({ scheme: 'vscode-resource' });
        let dagreD3ResourcePath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'assets', 'dagre-d3.min.js')).with({ scheme: 'vscode-resource' });
        s = s.replace('$d3ResourcePath$', d3ResourcePath.toString());
        s = s.replace('$dagreD3ResourcePath$', dagreD3ResourcePath.toString());

        webviewPanel.webview.html = s;
    }

    private async buildGraph(document: TextDocument): Promise<dagre.graphlib.Graph> {
        let components = await configParser.parse(document);

        var g = new dagre.graphlib.Graph();

        // set graph properties
        g.setGraph({
            ranker: 'tight-tree' // both 'network-simplex' and 'tight-tree' give acceptable results
        });        
        
        // Default to assigning a new object as a label for each new edge.
        g.setDefaultEdgeLabel(function() { return {}; });

        for (let component of components) {
            if (component.componentType === 'cComponentManager') {
                continue;
            }
            g.setNode('component_' + component.instanceName, { 
                label: `${component.instanceName}:${component.componentType}`, 
                shape: 'rect', 
                rx: 5,
                ry: 5,
                class: 'component',
                definitionLocation: component.sectionHeaders[0]
            });
        }

        let levels: Set<string> = new Set<string>();

        for (let component of components) {
            let componentInfo = symbolCache.lookupComponent(component.componentType);
            if (componentInfo) {
                if (componentInfo.readsFromLevels) {
                    for (let field of componentInfo.readsFromLevels) {
                        let fieldValue = component.getFieldValue(field);
                        if (fieldValue && fieldValue.value) {
                            let readerLevels = Component.parseArrayValue(fieldValue.value, 'string') as string[];
                            for (let level of readerLevels) {
                                levels.add(level);
                                g.setEdge('level_' + level, 'component_' + component.instanceName, {
                                    arrowheadClass: 'arrowhead'
                                });  
                            }
                        }
                    }
                }
                if (componentInfo.writesToLevels) {
                    for (let field of componentInfo.writesToLevels) {
                        let fieldValue = component.getFieldValue(field);
                        if (fieldValue && fieldValue.value) {
                            let writerLevels = Component.parseArrayValue(fieldValue.value, 'string') as string[];
                            for (let level of writerLevels) {
                                levels.add(level);
                                g.setEdge('component_' + component.instanceName, 'level_' + level, {
                                    arrowheadClass: 'arrowhead'
                                });
                            }
                        }
                    }
                }
                if (componentInfo.sendsMessagesToComponents) {
                    for (let field of componentInfo.sendsMessagesToComponents) {
                        let fieldValue = component.getFieldValue(field);
                        if (fieldValue && fieldValue.value) {
                            let targetComponents = (fieldValue.value as string).split(',');
                            for (let targetComponent of targetComponents) {
                                // we need to make sure that the component nodes actually exist, otherwise the graph would not get drawn at all
                                if (components.some(c => c.instanceName === targetComponent)) {
                                    g.setEdge('component_' + component.instanceName, 'component_' + targetComponent, {
                                        class: 'messages',
                                        arrowheadClass: 'arrowheadMessages'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        for (let level of levels) {
            g.setNode('level_' + level, { 
                label: level,
                shape: 'ellipse', 
                class: 'level' 
            });
        }
        
        dagre.layout(g);

        return g;
    }
}