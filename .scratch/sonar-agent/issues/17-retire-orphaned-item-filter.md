# 17: Retire Orphaned ItemFilter Module

**What to build:** Retire dead code `src/modules/ItemFilter.ts` and its test file `test/ItemFilter.test.ts`. Filtering is handled 100% locally in the Webview DOM script without round-trip latency, making `ItemFilter.ts` an unused orphaned module violating YAGNI.

**Blocked by:** none

**Status:** complete

- [x] Delete `src/modules/ItemFilter.ts`.
- [x] Delete `test/ItemFilter.test.ts`.
- [x] Verify zero broken imports or exports across the repository.
- [x] Verify all test suites, typecheck, lint, formatting, and build pass cleanly.
