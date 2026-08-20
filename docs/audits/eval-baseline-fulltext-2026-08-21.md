# Fulltext retrieval eval baseline

> Date: 2026-08-21
> Stage: fulltext (Stage 1)
> Command: `pnpm eval -- --json`

This is the Stage 1 baseline for issue #13. Later vector/hybrid/rerank loops compare against these numbers. Do not delete known-fail cases to inflate hit rate.

## Metrics

| Metric | Value |
|---|---|
| total cases | 10 |
| pass | 8 |
| known_fail | 2 |
| unexpected_fail | 0 |
| unexpected_pass | 0 |
| hit_rate | 1.000 |

`hit_rate` = pass / cases with `expect=pass`. Known-fail cases are excluded from the denominator.

## Cases

Expected documents are repo-relative fixture paths. Runtime document ids hash the absolute path and must not be copied into this file.

| id | category | expect | status | query |
|---|---|---|---|---|
| keyword-product-force | keyword | pass | pass | 产品力 |
| keyword-tech-force | keyword | pass | pass | 技术力 |
| keyword-pgvector | keyword | pass | pass | pgvector |
| keyword-compose | keyword | pass | pass | Docker Compose |
| keyword-chat-boundary | keyword | pass | pass | 聊天发言原文 |
| synonym-user-experience | synonym | known-fail | known-fail | user experience |
| synonym-rag-english | synonym | known-fail | known-fail | retrieval augmented generation |
| tag-product-strategy | tag | pass | pass | 产品力 + tag product-strategy |
| tag-wrong-filter | tag | pass | pass | 产品力 + tag infrastructure (expect none) |
| none-impossible-token | none | pass | pass | xyzzy-eval-no-hit-token |

## Known gaps (intentional)

English glosses of 产品力 / 知识检索 do not hit the meeting fixture under `simple` fulltext. That is the gap Stage 2 (vector) is supposed to close. Treat `unexpected-pass` on those two ids as a possible improvement, not a regression.

## Corpus

De-identified fixtures only: `fixtures/sample-meeting.md`, `fixtures/eval/sample-article.md`, `fixtures/eval/sample-ops.md`.
