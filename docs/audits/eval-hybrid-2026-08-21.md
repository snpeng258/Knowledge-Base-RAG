# Hybrid retrieval eval comparison

> Date: 2026-08-21
> Stage: hybrid (Stage 2)
> Command: `pnpm eval -- --json`
> Compared to: [eval-baseline-fulltext-2026-08-21.md](./eval-baseline-fulltext-2026-08-21.md)

Hybrid search fuses fulltext with pgvector cosine recall (RRF, minimum cosine 0.42). Synonym `expect` values in `cases.json` are **unchanged** so the Stage 1 baseline stays auditable; improvements show up as `unexpected-pass`.

## Metrics

| Metric | Fulltext baseline | Hybrid (this run) |
|---|---|---|
| total cases | 10 | 10 |
| pass | 8 | 8 |
| known_fail | 2 | 0 |
| unexpected_fail | 0 | 0 |
| unexpected_pass | 0 | 2 |
| hit_rate | 1.000 | 1.000 |

`hit_rate` stays 1.000 (not below baseline). Two former known-fail synonym cases now hit the expected document via vectors.

## Synonym movement

| id | query | baseline | hybrid |
|---|---|---|---|
| synonym-user-experience | user experience | known-fail (no hit) | unexpected-pass |
| synonym-rag-english | retrieval augmented generation | known-fail (no hit) | unexpected-pass |

## Notes

- Unit tests still run the suite through `FulltextRetriever` so Stage 1 numbers stay deterministic.
- `pnpm eval` uses `HybridRetriever` and embeds missing chunks first.
- Cosine floor 0.42 was chosen so English glosses match without letting `xyzzy-eval-no-hit-token` through.
