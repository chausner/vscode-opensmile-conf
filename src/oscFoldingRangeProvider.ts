'use strict';

import { TextDocument, CancellationToken, FoldingRangeProvider, FoldingContext, FoldingRange, FoldingRangeKind } from 'vscode';
import { configParser, SectionHeaderContext, FieldAssignmentContext } from './configParser';

export class OSCFoldingRangeProvider implements FoldingRangeProvider {
    async provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): Promise<FoldingRange[]> {
        let foldingRanges: FoldingRange[] = [];

        let currentRangeStart: number | undefined;
        let currentRangeEnd: number | undefined;

        await configParser.iterate(document, false, parserContext => {
            if (parserContext instanceof SectionHeaderContext) {
                if (currentRangeStart && currentRangeEnd) {
                    foldingRanges.push(new FoldingRange(currentRangeStart, currentRangeEnd, FoldingRangeKind.Region));
                }
                currentRangeStart = parserContext.line;
                currentRangeEnd = undefined;
			} else if (parserContext instanceof FieldAssignmentContext) {
                if (currentRangeStart) {
                    currentRangeEnd = parserContext.line;
                }
            }
        });	
        
        if (currentRangeStart && currentRangeEnd) {
            foldingRanges.push(new FoldingRange(currentRangeStart, currentRangeEnd, FoldingRangeKind.Region));
        }

		return foldingRanges;
    }
}