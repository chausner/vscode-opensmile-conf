'use strict';

import * as vscode from 'vscode';
import { Diagnostic, TextDocument } from 'vscode';
import { configParser, SectionHeaderContext, FieldAssignmentContext, Component } from './configParser';
import { symbolCache } from './symbolCache';

export class OSCDiagnostics {
    public static async apply(document: TextDocument): Promise<void> {
		let diagnostics: Diagnostic[] = [];

		this.checkComponentTypesAndFieldsExist(document, diagnostics);
		await this.checkRequiredFieldsArePresent(document, diagnostics);
		await this.warnForBackwardCompatibilityFlags(document, diagnostics);

		let diagnosticCollection = vscode.languages.createDiagnosticCollection('opensmile-diags');
		diagnosticCollection.set(document.uri, diagnostics);
	}

	private static checkComponentTypesAndFieldsExist(document: TextDocument, diagnostics: Diagnostic[]) {
		configParser.iterate(document, false, parserContext => {
			if (parserContext instanceof SectionHeaderContext) {
				if (!symbolCache.components.has(parserContext.componentType)) {
					diagnostics.push(new Diagnostic(parserContext.componentTypeRange, `Component with name "${parserContext.componentType}" does not exist.`, vscode.DiagnosticSeverity.Error));
				}
			} else if (parserContext instanceof FieldAssignmentContext) {
				let sectionHeaderContext = configParser.findParentSectionHeaderContext(parserContext.document, parserContext.line);
				if (sectionHeaderContext) {					
					let field = Component.resolveFieldExpression(sectionHeaderContext.componentType, parserContext.field);
					if (!field) {
						// only show errors if the component does exists 
						if (symbolCache.components.has(sectionHeaderContext.componentType)) {
						    diagnostics.push(new Diagnostic(parserContext.fieldRange, `Field with name "${parserContext.field}" does not exist for component "${sectionHeaderContext.componentType}".`, vscode.DiagnosticSeverity.Error));
						}
					} else {
						if (field.allowedValues) {
							let validValue: boolean;
							if (field.type === 'string' || field.type === 'char') {
								validValue = (field.allowedValues as any).indexOf(parserContext.value) >= 0;
							} else if (field.type === 'numeric') {
								validValue = (field.allowedValues as any).indexOf(parseFloat(parserContext.value)) >= 0;
							} else {
								validValue = true;
							}
							if (!validValue) {
								diagnostics.push(new Diagnostic(parserContext.valueRange, `"${parserContext.value}" is not a valid value for field "${parserContext.field}" of component "${sectionHeaderContext.componentType}".`, vscode.DiagnosticSeverity.Error));
							}
						}
					}					
				}
			}
		});
	}

	private static async checkRequiredFieldsArePresent(document: TextDocument, diagnostics: Diagnostic[]): Promise<void> {
		// not implemented yet
		/*let components = await configParser.parse(document);
        for (let component of components) {
			for (let fieldInfo of symbolCache.enumerateFields(component.componentType)) {
				if (fieldInfo.type !== 'numeric' && fieldInfo.type !== 'string' && fieldInfo.type !== 'char') {
					// checkRequiredFieldsArePresent( fieldInfo.type
				}
				if (fieldInfo.required) {
					let fieldValue = component.getFieldValue(fieldInfo.field);
					if (!fieldValue || !fieldValue.assignment) {
						let diagnosticRange = component.sectionHeaders[component.sectionHeaders.length - 1].componentInstanceRange;
						let diagnosticMessage = `Field "${fieldInfo.field}" of ${component.componentType} instance "${component.instanceName}" is required.`;
						diagnostics.push(new Diagnostic(diagnosticRange, diagnosticMessage, vscode.DiagnosticSeverity.Error));
					}
				}
			}			
		}*/
	}

	private static async warnForBackwardCompatibilityFlags(document: TextDocument, diagnostics: Diagnostic[]): Promise<void> {
		let components = await configParser.parse(document);
        for (let component of components) {
			for (let fieldInfo of symbolCache.enumerateFields(component.componentType)) {
				if (fieldInfo.recommendedValue !== undefined) {
					let fieldValue = component.getFieldValue(fieldInfo.field);
					if (!fieldValue) {
						continue;
					}
					if (fieldValue.value !== fieldInfo.recommendedValue) {
						let diagnosticRange: vscode.Range;
						if (!fieldValue.assignment) {
							diagnosticRange = component.sectionHeaders[component.sectionHeaders.length - 1].componentInstanceRange;
						} else {
							diagnosticRange = fieldValue.assignment.valueRange;
						}
						let diagnosticMessage = `Field "${fieldInfo.field}" of ${component.componentType} instance "${component.instanceName}" should be set to "${fieldInfo.recommendedValue}" to disable backward-compatibility behavior.`;
						diagnostics.push(new Diagnostic(diagnosticRange, diagnosticMessage, vscode.DiagnosticSeverity.Warning));
					}
				}
			}
		}
	}
}