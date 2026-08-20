# 单一数据库选型备忘（脱敏 fixture）

本文讨论知识检索把关系数据、全文检索和向量放在同一套 PostgreSQL 里，而不是再引入独立向量库。

选用官方 pgvector 镜像即可。全文层用 `simple` 配置的 tsvector 做兜底。向量层是后加的能力，不参与本篇结论。

不要把模型推理塞进 Node 进程。embedding 与 rerank 若出现，也走独立 HTTP 服务。
