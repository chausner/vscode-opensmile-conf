'use strict';

import { TextDocument, CancellationToken, FoldingRangeProvider, FoldingContext, FoldingRange, FoldingRangeKind } from 'vscode';
import { configParser, SectionHeaderContext, FieldAssignmentContext } from './configParser';

export class OSCFoldingRangeProvider implements FoldingRangeProvider {
    provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): FoldingRange[] | undefined {
        let foldingRanges: FoldingRange[] = [];

        let currentRangeStart: number | undefined;
        let currentRangeEnd: number | undefined;

		for (let line = 0; line < document.lineCount; line++) {
			let parserContext = configParser.getContext(document, line);
			if (parserContext instanceof SectionHeaderContext) {
                if (currentRangeStart && currentRangeEnd) {
                    foldingRanges.push(new FoldingRange(currentRangeStart, currentRangeEnd, FoldingRangeKind.Region));
                }
                currentRangeStart = line;
                currentRangeEnd = undefined;
			} else if (parserContext instanceof FieldAssignmentContext) {
                if (currentRangeStart) {
                    currentRangeEnd = line;
                }
            }
        }		
        
        if (currentRangeStart && currentRangeEnd) {
            foldingRanges.push(new FoldingRange(currentRangeStart, currentRangeEnd, FoldingRangeKind.Region));
        }

		return foldingRanges;
    }
}