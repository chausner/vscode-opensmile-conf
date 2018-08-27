'use strict';

import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import { TextDocument, Range } from "vscode";
import { symbolCache, FieldInfo } from "./symbolCache";

export class ConfigParserContext {
    constructor(public document: TextDocument, public line: number) {}
}

export class SectionHeaderContext extends ConfigParserContext {
    private static regex = /^(\s*\[\s*)([a-zA-Z0-9_]+)(\s*:\s*)([a-zA-Z0-9_]+)\s*\]/;

    private constructor(
        document: TextDocument, 
        line: number, 
        public componentInstance: string, 
        public componentInstanceRange: Range, 
        public componentType: string, 
        public componentTypeRange: Range) {
        super(document, line);
    }

    public static from(document: TextDocument, line: number): SectionHeaderContext | undefined {
        let textLine = document.lineAt(line);
        let text = textLine.text;
        let match = this.regex.exec(text);        
        if (!match) {
            return undefined;
        }
        let componentInstance = match[2];
        let componentInstanceRangeStart = textLine.range.start.translate(0, match[1].length);
        let componentInstanceRangeEnd = componentInstanceRangeStart.translate(0, componentInstance.length);
        let componentInstanceRange = new Range(componentInstanceRangeStart, componentInstanceRangeEnd);
        let componentType = match[4];
        let componentTypeRangeStart = textLine.range.start.translate(0, match[1].length + match[2].length + match[3].length);
        let componentTypeRangeEnd = componentTypeRangeStart.translate(0, componentType.length);
        let componentTypeRange = new Range(componentTypeRangeStart, componentTypeRangeEnd);
        return new SectionHeaderContext(document, line, componentInstance, componentInstanceRange, componentType, componentTypeRange);
    }
}

export class FieldAssignmentContext extends ConfigParserContext {
    private static regex = /^(\s*)([a-zA-Z0-9_\.\[\]]+)(\s*=\s*)(.*)/;

    private constructor(document: TextDocument, line: number, public field: string, public fieldRange: Range, public value: string, public valueRange: Range) {
        super(document, line);
    }

    public static from(document: TextDocument, line: number): FieldAssignmentContext | undefined {
        let textLine = document.lineAt(line);
        let text = textLine.text;
        let match = this.regex.exec(text);       
        if (!match) {
            return undefined;
        }
        let field = match[2];
        let fieldRangeStart = textLine.range.start.translate(0, match[1].length);
        let fieldRangeEnd = fieldRangeStart.translate(0, field.length);
        let fieldRange = new Range(fieldRangeStart, fieldRangeEnd);
        let value = match[4];
        let valueRangeStart = textLine.range.start.translate(0, match[1].length + match[2].length + match[3].length);
        let valueRangeEnd = valueRangeStart.translate(0, value.length);
        let valueRange = new Range(valueRangeStart, valueRangeEnd);
        return new FieldAssignmentContext(document, line, field, fieldRange, value, valueRange);
    }
}

export class IncludeDirectiveContext extends ConfigParserContext {
    private static regex = /^\s*\\\{(.+)\}/;

    private constructor(document: TextDocument, line: number, public fileName: string) {
        super(document, line);
    }

    public static from(document: TextDocument, line: number): IncludeDirectiveContext | undefined {
        let textLine = document.lineAt(line);
        let text = textLine.text;
        let match = this.regex.exec(text);       
        if (!match) {
            return undefined;
        }
        let fileName = match[1];
        return new IncludeDirectiveContext(document, line, fileName);
    }
}

export class Component {
    constructor(public sectionHeaders: SectionHeaderContext[], public fieldAssignments: FieldAssignmentContext[]) {}

    public get instanceName(): string { 
        return this.sectionHeaders[0].componentInstance;
    }

    public get componentType(): string {
        return this.sectionHeaders[0].componentType;
    }

    public getFieldValue(field: string): { value: any, assignment: FieldAssignmentContext | undefined } | undefined {
        let fieldInfo = Component.resolveFieldExpression(this.componentType, field);
        if (!fieldInfo) {
            return undefined;
        }
        for (let assignment of this.fieldAssignments.reverse()) {
            if (assignment.field === field) {
                let value = Component.parseFieldValue(assignment.value, fieldInfo.type);
                if (value === undefined) {
                    value = assignment.value; // if the value can't be parsed according to the field type, parse as string
                }
                return {
                    value: value,
                    assignment: assignment
                };
            }
        }
        if (fieldInfo.default === undefined) {
            return undefined; // for the few cases where there is no default value for the field, just return undefined
        }
        return {
            value: fieldInfo.default,            
            assignment: undefined
        };
    }

    public static parseArrayValue(value: string, fieldType: string): string[] | number[] | undefined {
        let parts = value.split(';').map(s => s.trim());
        let values = parts.map(s => Component.parseFieldValue(s, fieldType));
        if (values.indexOf(undefined) !== -1) {
            return undefined;
        } else {
            return (values as string[] | number[]);
        }
    }

    private static parseFieldValue(value: string, fieldType: string): string | number | undefined {
        switch (fieldType) {
            case "string": return value;
            case "numeric": {
                let number = +(value); // +() is more strict in parsing to float than parseFloat
                if (!Number.isNaN(number)) {
                    return number;                    
                } else {
                    return undefined;
                }
            }
            case "char": {
                if (value.length === 1) {
                    return value;
                } else {
                    return undefined;
                }
            }
            default: return undefined;
        }
    }

    private static parseFieldExpression(field: string): ({ field: string } | { index: string })[] | undefined {
        let parts: ({ field: string } | { index: string })[] = [];

        var i = 0;
        while (i < field.length) {
            let match = /^[a-zA-Z0-9_]+/.exec(field.substr(i));
            if (match) {
                parts.push({ field: match[0] });
                i += match[0].length;
                continue;
            }
            match = /^\[[a-zA-Z0-9_]+\]/.exec(field.substr(i));
            if (match) {
                parts.push({ index: match[0] });
                i += match[0].length;
                continue;
            }
            if (field[i] === '.') {
                i++;
                continue;
            }            
            return undefined;            
        }

        return parts;
    }

    public static resolveFieldExpression(component: string, field: string): FieldInfo | undefined {
        //let match = /^([a-zA-Z0-9_]+(\[[a-zA-Z0-9_]+\])*)(\.([a-zA-Z0-9_]+)(\[[a-zA-Z0-9_]+\])*)*$/.exec(field);

        let parts = this.parseFieldExpression(field);

        if (!parts) {
            return undefined;
        }

        let currentComponent = component;
        let currentFieldInfo = undefined;

        for (let part of parts) {
            if ("field" in part) {
                let fieldInfo = symbolCache.lookupField(currentComponent, part.field, true);
                if (!fieldInfo) {
                    return undefined;
                }
                currentComponent = fieldInfo.type;
                currentFieldInfo = fieldInfo;
            } else if ("index" in part) {
                // do nothing
            }
        }

        return currentFieldInfo;
    }
}

export class ConfigParser {
    public getContext(document: TextDocument, line: number): ConfigParserContext {
        let context;
        context = SectionHeaderContext.from(document, line);
        if (context) {
            return context;
        }
        context = FieldAssignmentContext.from(document, line);
        if (context) {
            return context;
        }
        context = IncludeDirectiveContext.from(document, line);
        if (context) {
            return context;
        }
        return new ConfigParserContext(document, line);
    }

    public async iterate(document: TextDocument, descendIntoIncludedFiles: boolean, callback: (parserContext: ConfigParserContext) => any): Promise<void> {
        for (let line = 0; line < document.lineCount; line++) {
            let parserContext = configParser.getContext(document, line);
            if (parserContext instanceof IncludeDirectiveContext && descendIntoIncludedFiles) {
                let fullPath = path.join(vscode.workspace.rootPath as string, parserContext.fileName);
                if (fs.existsSync(fullPath)) {
                    let includedDocument = await vscode.workspace.openTextDocument(fullPath);
                    await this.iterate(includedDocument, descendIntoIncludedFiles, callback);
                }       
            } else {
                callback(parserContext);
            }
        }
    }

    public findParentSectionHeaderContext(document: TextDocument, line: number): SectionHeaderContext | undefined {
        for (let l = line; l >= 0; l--) {
            let c = this.getContext(document, l);
            if (c instanceof SectionHeaderContext) {
                return c;
            }
        }
        return undefined;
    }

    public async parse(document: TextDocument): Promise<Component[]> {
        let currentComponent: Component | undefined = undefined;
        let components: Map<String, Component> = new Map<string, Component>();

        await this.iterate(document, true, parserContext => {
            if (parserContext instanceof SectionHeaderContext) {
                currentComponent = components.get(parserContext.componentInstance);
                if (!currentComponent) {
                    currentComponent = new Component([parserContext], []);
                    components.set(currentComponent.instanceName, currentComponent);
                }
            } else if (parserContext instanceof FieldAssignmentContext) {
                if (currentComponent) {
                    currentComponent.fieldAssignments.push(parserContext);
                }
            }
        });

        return Array.from(components.values());
    }
}

export let configParser = new ConfigParser();