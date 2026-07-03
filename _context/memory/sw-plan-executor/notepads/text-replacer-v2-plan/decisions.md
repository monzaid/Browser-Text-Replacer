# Notepad · decisions
## Plan: text-replacer-v2-plan

### D1: esbuild entry format
- background: IIFE (Service Worker doesn't support ESM in MV3)
- content: ESM (Chrome 91+ native, 88-90 fallback)
- Single content entry point for Tree Shaking

### D2: Shadow DOM host lifecycle
- Lazy create on first Ctrl+Shift+H
- host.hidden toggle for show/hide (preserve DOM state)
- host z-index: 2147483647
