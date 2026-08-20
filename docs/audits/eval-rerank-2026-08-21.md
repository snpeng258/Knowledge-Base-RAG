# Rerank eval comparison

> Date: 2026-08-21
> Stage: rerank (Stage 3), optional
> Commands: `pnpm eval -- --json` with `KB_RERANK_ENABLED=0` then `=1`
> Compared to: this same run's hybrid numbers (real `BAAI/bge-m3` embeddings after wiping mock vectors)

Rerank reorders hybrid candidates via a second CPU TEI service (`BAAI/bge-reranker-v2-m3` on `:8082`). `cases.json` `expect` values are unchanged.

## Decision

**No measurable ranking gain on the official eval set. Keep the implementation, default OFF (`KB_RERANK_ENABLED=0`).**

Set `KB_RERANK_ENABLED=1` to turn Stage 3 on. Failure or timeout still returns hybrid recall order.

## Metrics

| Metric | Hybrid (this run) | Rerank on |
|---|---|---|
| report.stage | hybrid | rerank |
| total | 10 | 10 |
| pass | 8 | 8 |
| known_fail | 1 | 1 |
| unexpected_fail | 0 | 0 |
| unexpected_pass | 1 | 1 |
| hit_rate | 1.000 | 1.000 |

hit_rate is a set-overlap score. Rerank is not allowed to change the recall set, so hit_rate cannot improve here. Ranking is judged from `actual_ids` order.

## Order (cases with more than one id)

| id | hybrid actual_ids | rerank actual_ids |
|---|---|---|
| keyword-pgvector | ops, article | **same** |
| keyword-compose | ops, article | **same** |

Every other case has a single id or an empty list, identical with or without rerank. `synonym-rag-english` stays known-fail (no hit). `synonym-user-experience` stays unexpected-pass.

## Notes

- Live `pnpm kb search "产品力" --json` with rerank on returns `stage=rerank` (exit 0). Dead `KB_RERANK_URL` keeps `stage=hybrid` and non-empty results.
- Mock embedders in tests use a unique `model_name` per run so they do not overwrite `BAAI/bge-m3` rows.
- After deleting poisoned `BAAI/bge-m3` rows and re-embedding with TEI, hybrid's `synonym-rag-english` is known-fail again. The #19 audit's two unexpected-pass synonym rows were inflated by mock vectors sharing that model name.
