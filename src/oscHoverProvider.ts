'use strict';

import { HoverProvider, Hover, TextDocument, Position, CancellationToken, MarkdownString } from 'vscode';
import { configParser, SectionHeaderContext, FieldAssignmentContext, Component } from './configParser';
import { symbolCache } from './symbolCache';
import { Utils } from './utils';

export class OSCHoverProvider implements HoverProvider {
	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | undefined { 
		if (symbolCache.empty) {
			return undefined;
		}
		let context = configParser.getContext(document, position.line);
		if (context instanceof SectionHeaderContext) {
			return this.provideHoverForSectionHeader(document, position, context);
		} else if (context instanceof FieldAssignmentContext) {
			return this.provideHoverForFieldAssignment(document, position, context);
		} else {
			return undefined;
		}
	}

	private provideHoverForSectionHeader(document: TextDocument, position: Position, context: SectionHeaderContext): Hover | undefined {
		if (context.componentTypeRange.contains(position)) {
			let component = symbolCache.components.get(context.componentType);
			if (component) {
				return new Hover(Utils.convertToMarkdown(component.description));
			} 
		} 
		return undefined;
	}

	private provideHoverForFieldAssignment(document: TextDocument, position: Position, context: FieldAssignmentContext): Hover | undefined {
		if (context.fieldRange.contains(position)) {
			let sectionHeaderContext = configParser.findParentSectionHeaderContext(context.document, context.line);
			if (sectionHeaderContext) {				
				let positionIndex = position.character - context.fieldRange.start.character;
				let dotIndex = context.field.indexOf('.', positionIndex);
				let fieldExpressionPart = dotIndex !== -1 ? context.field.substr(0, dotIndex) : context.field;
				let field = Component.resolveFieldExpression(sectionHeaderContext.componentType, fieldExpressionPart);
				if (field) {
					let detail = new MarkdownString();					
					detail.appendText("(" + field.type + ") " + field.field);
					if (field.default) {
						detail.appendText(" [default: " + field.default + "]");
					}
					detail.appendMarkdown('\n\n' + Utils.convertToMarkdown(field.description).value);
					return new Hover(detail);
				} 				
			} 			
		}
		return undefined;
	}
}
