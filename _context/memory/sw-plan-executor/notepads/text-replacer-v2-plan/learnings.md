# Notepad · learnings
## Plan: text-replacer-v2-plan
## Started: 2026-07-02

### Codebase Conventions
- V1.0: IIFE modules, window.* global namespace
- Content script files loaded in manifest-declared order
- No build tool, no package.json, pure Vanilla JS
- chrome.storage not yet used

### Key Patterns
- Element finder uses CSS selector array + querySelectorAll
- Highlighter: overlay technique (input/textarea) + TreeWalker (contenteditable)
- MutationObserver: childList + subtree + attributeFilter(contenteditable,type)
- Event triggering: new Event('input'/'change', {bubbles:true,cancelable:true})

### Architecture Decisions (from design doc)
- Shadow DOM attachShadow({mode:'open'}) for panel isolation
- MessageProxy + CQRS for cross-boundary communication
- chrome.storage.local with 3-key schema
- CSS inline via esbuild text loader, migration to CSS custom properties
