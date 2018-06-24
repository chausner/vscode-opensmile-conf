'use strict';

import { TextDocument, Position, CancellationToken, ReferenceProvider, ReferenceContext, Location } from 'vscode';
import { configParser, Component } from './configParser';
import { symbolCache } from './symbolCache';

export class OSCReferenceProvider implements ReferenceProvider {
    public async provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Promise<Location[] | undefined> {
        let range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
        }
        
        let word = document.getText(range);
        
		let locations: Location[] = [];

		let components = await configParser.parse(document);
		for (let component of components) {
			let componentInfo = symbolCache.lookupComponent(component.componentType);
			if (componentInfo && componentInfo.writesToLevels && context.includeDeclaration) {
				for (let field of componentInfo.writesToLevels) {
					let fieldValue = component.getFieldValue(field);
					if (fieldValue && fieldValue.value === word && fieldValue.assignment) {
						let referenceLocation = new Location(fieldValue.assignment.document.uri, fieldValue.assignment.valueRange);
						// TODO: should get the proper range of the level in the field expression here
						locations.push(referenceLocation);					
					}
				}
			}
			if (componentInfo && componentInfo.readsFromLevels) {
				for (let field of componentInfo.readsFromLevels) {
					let fieldValue = component.getFieldValue(field);
					if (fieldValue && fieldValue.assignment) {
						let levels = Component.parseArrayValue(fieldValue.value, 'string') as string[];
						if (levels.indexOf(word) !== -1) {
							let referenceLocation = new Location(fieldValue.assignment.document.uri, fieldValue.assignment.valueRange);
							// TODO: should get the proper range of the level in the field expression here
							locations.push(referenceLocation);					
						}
					}
				}
			}
		}

		return locations;
    }
}