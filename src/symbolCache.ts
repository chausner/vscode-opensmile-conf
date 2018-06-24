'use strict';

import cp = require('child_process');
import fs = require('fs');

export type ComponentInfo = {
    component: string,
    description: string,
    baseComponent?: string,
    isStruct: boolean,
    fields: Map<string, FieldInfo>,
    readsFromLevels?: string[],
    writesToLevels?: string[],
    sendsMessagesToComponents?: string[]
};

export enum FieldVisibility {
    Primary = "primary",
    Secondary = "secondary",
    Hidden = "hidden"
}

export type FieldInfo = {
    field: string,
    type: string, 
    default?: string | number,
    description: string,
    required: boolean,
    visibility: FieldVisibility,
    typeHint?: string,
    suggestedValues?: string[] | number[],
    allowedValues?: string[] | number[],
    recommendedValue?: string | number
};

export class SymbolCache {
    public components: Map<string, ComponentInfo> = new Map<string, ComponentInfo>();

    private smilextractPath: string = '';

    public async populateCache(smilextractPath: string): Promise<void> {
        this.smilextractPath = smilextractPath;
        await this.getComponentDescriptionsFromSMILExtract();
        await this.getComponentFieldsFromSMILExtract();
    }

    public clear() {
        this.components.clear();
    }

    public lookupComponent(component: string): ComponentInfo | undefined {
        return this.components.get(component);
    }

    public lookupField(component: string, field: string, lookupInBaseComponents: boolean = true): FieldInfo | undefined {
        let componentInfo = this.lookupComponent(component);
        if (!componentInfo) {
            return undefined;
        }
        let fieldInfo = componentInfo.fields.get(field);
        if (fieldInfo) {
            return fieldInfo;
        }
        if (lookupInBaseComponents && componentInfo.baseComponent) {
            return this.lookupField(componentInfo.baseComponent, field, true);
        } else {
            return undefined;
        }
    }

    public* enumerateFields(component: string, includeFieldsOfBaseComponents: boolean = true): IterableIterator<FieldInfo> {
        let componentInfo = this.lookupComponent(component);
        if (!componentInfo) {
            return;
        }
        yield* componentInfo.fields.values();
        if (componentInfo.baseComponent && includeFieldsOfBaseComponents) {
            for (let field of this.enumerateFields(componentInfo.baseComponent, true)) {
                if (!componentInfo.fields.has(field.field)) { // do not include fields of base components that have been overridden
                    yield field;
                }
            }
        }
    }

    public loadFromJson(path: string) {
        this.components.clear();
        let json: string = fs.readFileSync(path, 'utf8');
        let jsonRoot = JSON.parse(json);
        if (jsonRoot.version !== '1.0') {
            return;
        }        
        for (let component of jsonRoot.components) {
            let fields = new Map<string, FieldInfo>();
            for (let field of component.fields) {
                fields.set(field.field, {
                    field: field.field,
                    type: field.type, 
                    default: field.default,
                    description: field.description,
                    required: field.required || false,
                    visibility: field.visibility || FieldVisibility.Secondary,
                    typeHint: field.typeHint,
                    suggestedValues: field.suggestedValues,
                    allowedValues: field.allowedValues,
                    recommendedValue: field.recommendedValue
                });
            }
            this.components.set(component.component, {
                component: component.component,
                description: component.description,
                baseComponent: component.baseComponent,
                isStruct: false,
                fields: fields,
                readsFromLevels: component.readsFromLevels,
                writesToLevels: component.writesToLevels,
                sendsMessagesToComponents: component.sendsMessagesToComponents
            });
        }
        for (let object of jsonRoot.objects) {
            let fields = new Map<string, FieldInfo>();
            for (let field of object.fields) {
                fields.set(field.field, {
                    field: field.field,
                    type: field.type, 
                    default: field.default,
                    description: field.description,
                    required: field.required || false,
                    visibility: field.visibility || FieldVisibility.Secondary,
                    typeHint: field.typeHint,
                    suggestedValues: field.suggestedValues,
                    allowedValues: field.allowedValues,
                    recommendedValue: field.recommendedValue
                });
            }
            this.components.set(object.object, {
                component: object.object,
                description: '',
                baseComponent: undefined,
                isStruct: true,
                fields: fields
            });
        }
    }

    public saveAsJson(path: string) {
        let components = [];
        for (let k of this.components.values()) {
            let fields = [];
            for (let f of k.fields.values()) {
                fields.push(f);
            }
            let component: any = {
                component: k.component,
                description: k.description,
                fields: fields
            };
            if (k.readsFromLevels) {
                component.readsFromLevels = k.readsFromLevels;
            }
            if (k.writesToLevels) {
                component.writesToLevels = k.writesToLevels;
            }
            if (k.sendsMessagesToComponents) {
                component.sendsMessagesToComponents = k.sendsMessagesToComponents;
            }
            components.push(component);
        }
        let jsonRoot = {
            'version': '1.0',
            'components': components
        };
        let json: string = JSON.stringify(jsonRoot);
        fs.writeFileSync(path, json, 'utf8');
    }

    public get empty(): boolean {
        return this.components.size === 0;
    }

    private async getComponentDescriptionsFromSMILExtract(): Promise<void> {        
        let output = await this.runSMILExtract(['-L']);
        let lines = output.split(/\r?\n/);
        let components = new Map<string, ComponentInfo>();
        this.splitLines(/^ \+\+\+ '(.+)' \+\+\+$/, lines, (match, lines) => {
            components.set(match[1], {
                component: match[1],
                description: lines.map(line => line.trim()).join('\n').trim(),
                isStruct: false,
                fields: new Map<string, FieldInfo>()
            });
        });
        this.components = components;
    }
    
    private async getComponentFieldsFromSMILExtract(): Promise<void> {
		let output = await this.runSMILExtract(['-H']);
        let lines = output.split(/\r?\n/);
        this.splitLines(/^ === ConfigType '(.+)' : ===$/, lines, (match, lines) => {
            let component = match[1];
            let fields: Map<string, FieldInfo> = new Map<string, FieldInfo>();
            this.splitLines(/^ (.+) = <(.+)>(\s+\[dflt: (.+)\])?$/, lines, (match, lines) => {
                fields.set(match[1].replace(/\[\]/g, ''), { 
                    field: match[1].replace(/\[\]/g, ''), 
                    type: match[2], 
                    default: match[4],
                    description: lines.map(line => line.trim()).join('\n').trim(),
                    required: false,
                    visibility: FieldVisibility.Secondary
                });
            });            
            if (this.components) {
                let componentInfo = this.components.get(component);
                if (componentInfo) {
                    componentInfo.fields = fields;
                } else {
                    // this case should not happen but we handle it anyway
                    this.components.set(component, {
                        component: component,
                        description: '',
                        isStruct: false,
                        fields: fields
                    });
                }
            }
        });		
    }

    private runSMILExtract(args: string[]): Promise<string> {
		if (!fs.existsSync(this.smilextractPath)) {
			return Promise.reject('Could not find SMILExtract executable');
		}
	    /*let process: cp.ChildProcess;
		if (token) {
			token.onCancellationRequested(() => { 
				if (process) { 
					process.kill(); 
				}
			});
		}*/
		return new Promise<string>((resolve, reject) => {        
            let execFileOptions = {
                maxBuffer: 8 * 1024 * 1024
            }; 
			/*let process =*/ cp.execFile(this.smilextractPath, args.concat(['-nologfile']), execFileOptions, (err, stdout, stderr) => {
				try {
					if (err && (<any>err).code === 'ENOENT') {
						return reject('Could not find SMILExtract executable');
					}
					if (err && (<any>err).code === 4294967295) {
						return resolve(stderr); // we expect SMILExtract to return with exit code -1. The output will be in stderr.			
					} else {
						return reject(err.message || stderr);
					}			
				} catch (e) {
					reject(e);
				}
			});
		});
    }
    
    private splitLines(regex: RegExp, lines: string[], callback: (match: RegExpExecArray, lines: string[]) => any) {
        let currentSectionMatch: RegExpExecArray | undefined;
        let currentSectionLines: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            let match = regex.exec(lines[i]);
            if (match) {
                if (!currentSectionMatch) {
                    currentSectionMatch = match;
                } else {
                    callback(currentSectionMatch, currentSectionLines);
                    currentSectionMatch = match;
                    currentSectionLines = [];
                }
            } else {
                if (currentSectionMatch) {
                    currentSectionLines.push(lines[i]);
                }
            }
        }
        if (currentSectionMatch) {
            callback(currentSectionMatch, currentSectionLines);
        }
    }
}

export let symbolCache = new SymbolCache();