# Change Log
All notable changes to the "opensmile-config-files" extension will be documented in this file.

## [Unreleased]

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