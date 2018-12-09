# Change Log
All notable changes to the "opensmile-config-files" extension will be documented in this file.

## [Unreleased]

## [1.3.0] - 2018-12-09
## Added
- Make paths in include directives clickable hyperlinks to the included file
- Support renaming of component instances and data memory levels
- Navigate to the definition location of levels when clicking on their nodes in the graph
- Add a refresh button to the graph view
- Highlight levels in graph that have no readers or writer
- It's now possible to show the component graph using the keyboard shortcut Ctrl+Alt+G

## Fixed
- Fix bug where diagnostics relating to a included file would show up in the wrong document
- The content of block comments are now ignored by the parser and shown with correct syntax highlighting

## [1.2.0] - 2018-11-02
### Added
- Component nodes in the graph are now colored according to their category (source/sink/data processor/functionals)
- Option to hide the data memory levels from the graph
- Controls for zooming in/out and resetting the view of the graph

### Changed
- Break up component node labels in the graph into two lines

### Fixed
- Edges in graph denoting sending of smile messages are now drawn in the correct style

## [1.1.1] - 2018-10-23
### Changed
- Improve the loading speed of the component graph
- Draw smooth edges in the graph, change rectangular nodes to rounded rectangles, use another layouting method for slightly better graph layouts
- Show status text while graph is still loading

### Fixed
- Fix bug where the graph would not be drawn if a component sent messages to multiple recipients
- Fix bug where the graph would not be drawn if a specified message recipient did not exist
- Fix bug where whitespace at the end of field assignments would not be discarded
- Properly handle array field assignments that end with a semicolon

## [1.1.0] - 2018-09-01
### Added
- Diagnostic: check name and type in component declarations match the component sections
- Show file name of the document for which a graph is generated in the title of the graph tab.
- Add symbol information for components cJuliusSink, cOpenslesSource, cJniMessageInterface and cOpenCVSource.

### Changed
- Tweak appearance of tooltips when hovering over field names

### Fixed
- Fix bug where diagnostics would not be cleared from the list when editing documents.
- Add missing symbol information for some components.
- Show graph for the correct document when multiple documents are opened at the same time.
- Prevent a second editor from opening when navigating to a graph node.
- Handle relative include paths properly
- No longer issue errors if a field value contains a command-line option directive
- Fix bug where diagnostics would not be showed for any documents loaded during the start of Visual Studio Code

## [1.0.0] - 2018-06-24
- Initial release