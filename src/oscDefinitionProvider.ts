'use strict';

import { TextDocument, Position, CancellationToken, DefinitionProvider, Location } from 'vscode';
import { configParser, FieldAssignmentContext, SectionHeaderContext } from './configParser';
import { symbolCache } from './symbolCache';

export class OSCDefinitionProvider implements DefinitionProvider {
	public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Location | undefined> {
        let range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
		}
		
		let word = document.getText(range);

		let parserContext = configParser.getContext(document, position.line);

		// use heuristic to determine whether the selected word is a level or component
		// TODO: we could do this more intelligently by looking whether the value is of type dmlevel
		let findDefinitionOfLevel = parserContext instanceof FieldAssignmentContext && parserContext.field.endsWith('dmLevel');

		let definitionLocation: Location | undefined;

		// attempt to find definition
		if (findDefinitionOfLevel) {
			definitionLocation = await this.findDefinitionOfLevel(word, document);
		} else {
			definitionLocation = await this.findDefinitionOfComponent(word, document);
		}

		// if a definition was not found, try with the other choice again
        if (!definitionLocation) {
			findDefinitionOfLevel = !findDefinitionOfLevel;
			if (findDefinitionOfLevel) {
				definitionLocation = await this.findDefinitionOfLevel(word, document);
			} else {
				definitionLocation = await this.findDefinitionOfComponent(word, document);
			}
		}

		return definitionLocation;
	}

	private async findDefinitionOfComponent(componentInstance: string, document: TextDocument): Promise<Location | undefined> {
		let definitionLocation: Location | undefined = undefined;

		await configParser.iterate(document, true, parserContext => {
			if (parserContext instanceof SectionHeaderContext) {
				if (parserContext.componentInstance === componentInstance) {
					definitionLocation = new Location(parserContext.document.uri, parserContext.componentInstanceRange);
					// TODO: should do an early return here
				}
			}
		});

		return definitionLocation;
	}

	private async findDefinitionOfLevel(level: string, document: TextDocument): Promise<Location | undefined> {
		let components = await configParser.parse(document);
		for (let component of components) {
			let componentInfo = symbolCache.lookupComponent(component.componentType);
			if (componentInfo && componentInfo.writesToLevels) {
				for (let field of componentInfo.writesToLevels) {
					let fieldValue = component.getFieldValue(field);
					if (fieldValue && fieldValue.value === level && fieldValue.assignment) {
						let definitionLocation = new Location(fieldValue.assignment.document.uri, fieldValue.assignment.valueRange);
						// TODO: should get the proper range of the level in the field expression here
						return definitionLocation;						
					}
				}
			}
		}

		return undefined;
	}
}