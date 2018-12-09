import * as vscode from 'vscode';
import { TextDocument, TextEditor } from 'vscode';
import fs = require('fs');
import path = require('path');
import dagre = require('dagre');
import { configParser, SectionHeaderContext, Component, FieldAssignmentContext } from './configParser';
import { extensionContext } from './extension';
import { symbolCache } from './symbolCache';

export class GraphDrawing {
    public async showGraph(textEditor: TextEditor): Promise<void> {
        if (textEditor.document.languageId !== 'opensmileconf') {
            await vscode.window.showErrorMessage('To run this command, an openSMILE configuration file must be loaded in the active editor.');
            return;
        }        
        let document = textEditor.document;
        
        let graph: dagre.graphlib.Graph | undefined;        
        let graphPromise: Promise<dagre.graphlib.Graph> | undefined = this.buildGraph(document, false);

        let title: string;
        if (!document.isUntitled) {
            title = `openSMILE component graph (${path.basename(document.fileName)})`;
        } else {
            title = 'openSMILE component graph';
        }
        let webviewPanel = vscode.window.createWebviewPanel('opensmileConfGraph', title, vscode.ViewColumn.Three, { 
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(extensionContext.extensionPath)]
        });

        webviewPanel.webview.onDidReceiveMessage(async message => {
            if (message.id === 'generateGraph') {
                if (graphPromise !== undefined && message.excludeLevels === false) {
                    // for the first generateGraph event we start building the graph in advance to save some time
                    // for any following generateGraph event, we rebuild it on-demand
                    graph = await graphPromise;
                    graphPromise = undefined;
                } else {
                    graph = await this.buildGraph(document, message.excludeLevels);
                }      
                let graphJson = dagre.graphlib.json.write(graph);
                webviewPanel.webview.postMessage({
                    id: 'graphGenerated',
                    graph: graphJson
                });
            } else if (message.id === 'nodeClicked') {
                let node = (graph as dagre.graphlib.Graph).node(message.nodeName);           
                if (node.class.endsWith('component') || node.class.startsWith('level')) {
                    let definitionLocation = node.definitionLocation as SectionHeaderContext | FieldAssignmentContext;                    
                    let range: vscode.Range;
                    if (definitionLocation instanceof SectionHeaderContext) {
                        range = definitionLocation.componentInstanceRange;
                    } else {
                        range = definitionLocation.valueRange;
                    } 
                    vscode.window.showTextDocument(definitionLocation.document, { 
                        viewColumn: (textEditor as vscode.TextEditor).viewColumn,
                        selection: range,
                        preserveFocus: true, 
                        preview: true
                    });
                }
            }
        }, undefined, extensionContext.subscriptions);

        fs.readFile(extensionContext.asAbsolutePath('assets/graph.htm'), 'utf8', (err, html) => {
            if (!err) {
                let assetsPath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'assets')).with({ scheme: 'vscode-resource' });
                html = html.replace(/\$assets\$/g, assetsPath.toString());
                webviewPanel.webview.html = html;
            }
        });
    }

    private async buildGraph(document: TextDocument, excludeLevels: boolean): Promise<dagre.graphlib.Graph> {
        let components = await configParser.parse(document);

        let g = new dagre.graphlib.Graph();

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
                label: `${component.instanceName}<br><b>${component.componentType}</b>`, 
                labelType: 'html',
                shape: 'rect', 
                rx: 5,
                ry: 5,
                class: this.getNodeColor(component),
                definitionLocation: component.sectionHeaders[0]
            });
        }

        let levels: Set<string> = new Set<string>();
        let readersOfLevels: Map<string, string[]> = new Map();
        let writersOfLevels: Map<string, string[]> = new Map();
        let definitionLocationOfLevels: Map<string, FieldAssignmentContext | SectionHeaderContext> = new Map();

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
                                if (!readersOfLevels.has(level)) {
                                    readersOfLevels.set(level, [component.instanceName]);
                                } else {
                                    (readersOfLevels.get(level) as string[]).push(component.instanceName);
                                }
                                if (!excludeLevels) {
                                    g.setEdge('level_' + level, 'component_' + component.instanceName, {
                                        arrowheadClass: 'arrowhead'
                                    });  
                                }
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
                                if (!writersOfLevels.has(level)) {
                                    writersOfLevels.set(level, [component.instanceName]);
                                    if (fieldValue.assignment) {
                                        definitionLocationOfLevels.set(level, fieldValue.assignment);
                                    } else {
                                        definitionLocationOfLevels.set(level, component.sectionHeaders[0]);
                                    }
                                } else {
                                    (writersOfLevels.get(level) as string[]).push(component.instanceName);
                                }
                                if (!excludeLevels) {
                                    g.setEdge('component_' + component.instanceName, 'level_' + level, {
                                        arrowheadClass: 'arrowhead'
                                    });
                                }
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

        if (!excludeLevels) {
            for (let level of levels) {
                let cls = 'level';
                if (!readersOfLevels.has(level) || !writersOfLevels.has(level)) {
                    cls += ' orphaned';
                }         
                g.setNode('level_' + level, { 
                    label: level,
                    shape: 'ellipse', 
                    class: cls,
                    definitionLocation: definitionLocationOfLevels.get(level)
                });
            }
        } else {
            let levelsWithReadersAndWriters = new Set<string>();
            for (let componentName of readersOfLevels.keys()) {
                if (writersOfLevels.has(componentName)) {
                    levelsWithReadersAndWriters.add(componentName);
                }
            }

            for (let level of levelsWithReadersAndWriters) {
                for (let componentName1 of (writersOfLevels.get(level) as string[])) {
                    for (let componentName2 of (readersOfLevels.get(level) as string[])) {
                        g.setEdge('component_' + componentName1, 'component_' + componentName2, {
                            label: level,
                            arrowheadClass: 'arrowheadMessages'
                        });
                    }
                }
            }
        }
        
        dagre.layout(g);

        return g;
    }

    private getNodeColor(component: Component): string {
        let ancestor = this.findAncestorComponent(component.componentType, [
            "cDataSource", "cDataSink", "cDataProcessor", "cFunctionals"
        ]);
        switch (ancestor) {
            case 'cDataSource': 
                return "green-component";
            case 'cDataSink': 
                return "red-component";
            case 'cDataProcessor': 
                return "blue-component";        
            case "cFunctionals":
                return "yellow-component";        
            default: 
                return 'blue-component';            
        }
    }

    private findAncestorComponent(component: string, ancestors: string[]): string | undefined {
        if (ancestors.indexOf(component) !== -1) {
            return component;
        }
        let componentInfo = symbolCache.lookupComponent(component);
        if (componentInfo === undefined || componentInfo.baseComponent === undefined) {
            return undefined;
        }
        return this.findAncestorComponent(componentInfo.baseComponent, ancestors);
    }
}