'use strict';

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionItemKind, Range } from 'vscode';
import { configParser, Component } from './configParser';
import { symbolCache } from './symbolCache';
import { Utils } from './utils';

export class OSCCompletionItemProvider implements CompletionItemProvider {
	public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[] | undefined> {
        if (!symbolCache.components) {
            return undefined;
        }
        let rangeLeftOfCursor = new Range(document.lineAt(position.line).range.start, position);
        let textLeftOfCursor = document.getText(rangeLeftOfCursor);
        let componentTypeCompletion = /^\s*\[(.+):\s*$/.test(textLeftOfCursor);
        if (componentTypeCompletion) {
            return this.provideComponentTypeCompletionItems();
        } else {
            let fieldValueCompletion = /^\s*([a-zA-Z0-9_\.\[\]]+)\s*=\s*$/.exec(textLeftOfCursor);
            if (fieldValueCompletion) {
                let fieldName = fieldValueCompletion[1];
                return await this.provideFieldValueCompletionItems(document, position, fieldName);
            } else {
                return this.provideFieldNameCompletionItems(document, position);
            }
        }
    }    

    private provideComponentTypeCompletionItems(): CompletionItem[] | undefined {
        return Array.from(symbolCache.components.values())
            .filter(componentInfo => !componentInfo.isStruct)
            .map(componentInfo => {
                let item = new CompletionItem(componentInfo.component, CompletionItemKind.Class);
                //item.detail = 
                item.documentation = Utils.convertToMarkdown(componentInfo.description);
                //item.range = 
                return item;
            });
    }

    private async provideFieldValueCompletionItems(document: TextDocument, position: Position, fieldName: string): Promise<CompletionItem[] | undefined> {
        let sectionHeaderContext = configParser.findParentSectionHeaderContext(document, position.line);
        if (!sectionHeaderContext) {
            return undefined;
        }
        let field = Component.resolveFieldExpression(sectionHeaderContext.componentType, fieldName);
        if (!field) {
            return undefined;
        }
        if (field.suggestedValues || field.allowedValues) {
            return (field.suggestedValues || field.allowedValues as any).map((value: string | number) => {
                let item = new CompletionItem(value.toString(), CompletionItemKind.Value);
                return item;
            });
        } else if (field.typeHint === 'dmLevel') {
            let components = await configParser.parse(document);
            let levels = [];
            for (let component of components) {
                let componentInfo = symbolCache.lookupComponent(component.componentType);
                if (componentInfo && componentInfo.writesToLevels) {
                    for (let field of componentInfo.writesToLevels) {
                        let fieldValue = component.getFieldValue(field);
                        if (fieldValue) {
                            levels.push(fieldValue.value as string);
                        }
                    }
                }
            }
            return levels.map(fieldValue => new CompletionItem(fieldValue, CompletionItemKind.Variable));
        } else if (field.typeHint === 'componentInstance' || field.typeHint === 'componentInstance,') {
            let components = await configParser.parse(document);
            return components.map(component => {
                let item = new CompletionItem(component.instanceName, CompletionItemKind.Variable);
                return item;
            });
        } else if (field.typeHint === 'componentType') {
            return this.provideComponentTypeCompletionItems();
        }
        return undefined;
    }

    private provideFieldNameCompletionItems(document: TextDocument, position: Position): CompletionItem[] | undefined {
        let sectionHeaderContext = configParser.findParentSectionHeaderContext(document, position.line);
        if (!sectionHeaderContext) {
            return undefined;
        }
        let rangeLeftOfCursor = new Range(document.lineAt(position.line).range.start, position);
        let textLeftOfCursor = document.getText(rangeLeftOfCursor);
        let type: string;
        if (textLeftOfCursor.endsWith('.')) {
            textLeftOfCursor = textLeftOfCursor.substr(0, textLeftOfCursor.length - 1);
            let fieldInfo = Component.resolveFieldExpression(sectionHeaderContext.componentType, textLeftOfCursor);
            if (!fieldInfo) {
                return undefined;
            }
            type = fieldInfo.type;
        } else {
            let i = textLeftOfCursor.lastIndexOf('.');
            if (i === -1) {
                type = sectionHeaderContext.componentType; 
            } else {
                textLeftOfCursor = textLeftOfCursor.substr(0, i);
                let fieldInfo = Component.resolveFieldExpression(sectionHeaderContext.componentType, textLeftOfCursor);
                if (!fieldInfo) {
                    return undefined;
                }
                type = fieldInfo.type;
            }
        }
        let fieldIterator = symbolCache.enumerateFields(type);
        return Array.from(fieldIterator).map(field => {
            let item = new CompletionItem(field.field, CompletionItemKind.Field);
            item.detail = "(" + field.type + ") " + field.field;
            if (field.default) {
                item.detail += " [default: " + field.default + "]";
            }
            item.documentation = Utils.convertToMarkdown(field.description);
            //if (field.type === 'string' || field.type === 'numeric' || field.type === 'char') {
            //    item.insertText = field.field + " = ";
            //}
            //item.range = document.lineAt(position.line).range;
            return item;
        });
    }
}