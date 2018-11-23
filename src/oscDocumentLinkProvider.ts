'use strict';

import { TextDocument, CancellationToken, ProviderResult, DocumentLink, DocumentLinkProvider, Uri, Range } from 'vscode';
import { configParser, IncludeDirectiveContext } from './configParser';

export class OSCDocumentLinkProvider implements DocumentLinkProvider {
    provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
        let links: DocumentLink[] = [];
        configParser.iterate(document, false, parserContext => {
            if (parserContext instanceof IncludeDirectiveContext) {
                if (!parserContext.fileName.includes('\\cm[')) {
                    let uri: Uri = configParser.resolveIncludeDirective(parserContext);
                    links.push(new DocumentLink(parserContext.fileNameRange, uri));
                } else {
                    // if the include file name is specified through a command-line option directive, provide the link for its default value (if present)
                    let match = parserContext.fileName.match(/^\\cm\[([a-zA-Z0-9_]+)(\(([a-zA-Z0-9_]+)\))?(\{([^\}]*)\})?(:(.*))?\]/);
                    if (match && match[4]) {
                        let path = parserContext.fileName.substr(4 + match[1].length + (match[2] ? match[2].length : 0) + 1, match[5].length);
                        let pathRangeStart = parserContext.fileNameRange.start.translate(0, 4 + match[1].length + (match[2] ? match[2].length : 0) + 1);
                        let pathRangeEnd = pathRangeStart.translate(0, match[5].length);
                        let pathRange = new Range(pathRangeStart, pathRangeEnd);
                        let uri: Uri = configParser.resolveIncludePath(path, parserContext.document);
                        links.push(new DocumentLink(pathRange, uri));                        
                    }
                }
            }
        });
        return links;
    }
}