import { MarkdownString } from "vscode";

/**
 * Utility functions
 */
export class Utils {
    /**
     * Converts a string to Markdown by replacing line breaks with Markdown paragraph breaks.
     * @param s String to convert.
     */
    public static convertToMarkdown(s: string): MarkdownString {
        let markdown = new MarkdownString();
        markdown.isTrusted = true;

        let lines = s.split(/\r?\n/);
        for (let i of lines.keys()) {
            markdown.appendText(lines[i]);
            if (i < lines.length - 1) {
                markdown.appendMarkdown('\n\n');
            }
        }

        return markdown;
    }
}