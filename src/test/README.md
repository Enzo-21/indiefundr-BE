# Backend tests

`npm test` runs unit tests that **do not mutate MongoDB** (no `create`, `update`, `upsert`, or `delete`).

Integration suites that previously wrote fixtures are skipped. To add coverage, mock `@/lib/prisma` or test pure functions without I/O.

Optional read-only smoke against a dev database is not part of the default test run.
