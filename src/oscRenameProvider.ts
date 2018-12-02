'use strict';

import { TextDocument, CancellationToken, ProviderResult, RenameProvider, Position, WorkspaceEdit, Range } from 'vscode';
import { configParser, SectionHeaderContext, FieldAssignmentContext, Component } from './configParser';

export class OSCRenameProvider implements RenameProvider {
    prepareRename(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Range> {
        let result = this.validateRename(document, position);
        if (result) {
            return result.range;
        } else {
            return undefined;
        }
    }

    provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): ProviderResult<WorkspaceEdit> {      
        let result = this.validateRename(document, position);
        if (result) {           
            let oldName = document.getText(result.range);  
            if (result.target === "componentInstance") {            
                return this.provideComponentInstanceRenameEdits(document, oldName, newName);
            } else if (result.target === "level") {
                return this.provideLevelRenameEdits(document, oldName, newName);
            }
        }
        return undefined;
    }

    private validateRename(document: TextDocument, position: Position): { target: "componentInstance" | "level", range: Range } | undefined {
        let parserContext = configParser.getContext(document, position.line);
        if (parserContext instanceof SectionHeaderContext) {
            if (parserContext.componentInstanceRange.contains(position)) {
                // rename a component instance at its section header
                return { target: "componentInstance", range: parserContext.componentInstanceRange };
            }
        } else if (parserContext instanceof FieldAssignmentContext) {
            if (parserContext.valueRange.contains(position)) {
                let parentSectionHeader = configParser.findParentSectionHeaderContext(document, position.line);
                if (parentSectionHeader) {                    
                    let fieldInfo = Component.resolveFieldExpression(parentSectionHeader.componentType, parserContext.field);
                    if (fieldInfo && fieldInfo.typeHint === 'dmLevel') {
                        let range = document.getWordRangeAtPosition(position);
                        if (range) {
                            // rename a data memory level
                            return { target: "level", range: range };
                        } else {
                            return undefined;
                        }
                    }
                }
            } else if (parserContext.fieldRange.contains(position)) {
                let parentSectionHeader = configParser.findParentSectionHeaderContext(document, position.line);
                if (parentSectionHeader) {
                    if (parentSectionHeader.componentInstance === 'componentInstances' && parentSectionHeader.componentType === 'cComponentManager') {
                        let range = document.getWordRangeAtPosition(position);
                        if (range) {
                            let stringBeforeRenamedWord = parserContext.field.substr(0, range.start.character - parserContext.fieldRange.start.character);
                            if (stringBeforeRenamedWord === 'instance[') {
                                // rename a component instance at its declaration
                                return { target: "componentInstance", range: range };
                            }
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private async provideComponentInstanceRenameEdits(document: TextDocument, oldName: string, newName: string): Promise<WorkspaceEdit | undefined> {
        let edit = new WorkspaceEdit();
        let components = await configParser.parse(document);
        let component = components.find(c => c.instanceName === oldName);
        if (!component) {
            return undefined;
        }
        // rename instance in all section headers
        for (let parserContext of component.sectionHeaders) {
            edit.replace(parserContext.document.uri, parserContext.componentInstanceRange, newName);
        }
        // rename component declaration
        let componentManager = components.find(c => c.instanceName === 'componentInstances' && c.componentType === 'cComponentManager');
        if (componentManager) {
            for (let parserContext of componentManager.fieldAssignments) {
                if (parserContext.field.startsWith('instance[' + oldName + ']')) {
                    let oldNameStart = parserContext.fieldRange.start.translate(0, 9);
                    let oldNameEnd = oldNameStart.translate(0, oldName.length);
                    edit.replace(parserContext.document.uri, new Range(oldNameStart, oldNameEnd), newName);
                }
            }
        }
        // rename in any field values whose typeHint is componentInstance
        await this.provideEditsInFieldValues(document, edit, oldName, newName, 'componentInstance');
        return edit;
    }

    private async provideLevelRenameEdits(document: TextDocument, oldName: string, newName: string): Promise<WorkspaceEdit> {
        let edit = new WorkspaceEdit();
        await this.provideEditsInFieldValues(document, edit, oldName, newName, 'dmLevel');
        return edit;
    }

    private async provideEditsInFieldValues(document: TextDocument, edit: WorkspaceEdit, oldName: string, newName: string, typeHint: string): Promise<void> {
        let sectionHeader: SectionHeaderContext | undefined;
        await configParser.iterate(document, true, parserContext => {
            if (parserContext instanceof SectionHeaderContext) {
                sectionHeader = parserContext;
            } else if (parserContext instanceof FieldAssignmentContext) {
                if (sectionHeader) {
                    let fieldInfo = Component.resolveFieldExpression(sectionHeader.componentType, parserContext.field);
                    if (fieldInfo && fieldInfo.typeHint === typeHint) {
                        let fieldValue = Component.parseArrayValue(parserContext.value, 'string') as string[] | undefined;
                        if (fieldValue) {
                            for (let part of fieldValue) {
                                if (part === oldName) {
                                    // TODO: this is a rather unrobust method to determine the range of the part and will fail 
                                    // if there is another level containing the part in its name
                                    let index = parserContext.value.indexOf(part);
                                    let start = parserContext.valueRange.start.translate(0, index);
                                    let range = new Range(start, start.translate(0, part.length));
                                    edit.replace(parserContext.document.uri, range, newName);
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}