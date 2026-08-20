INSERT INTO tags (slug, name, description) VALUES
  ('product-strategy', '产品策略', '产品方向、路线图、优先级与取舍相关的讨论或文档。'),
  ('storage', '存储', '数据库、对象存储、缓存、备份与数据持久化。'),
  ('infrastructure', '基础设施', '部署、容器、CI、运行时与环境相关的内容。')
ON CONFLICT (slug) DO UPDATE SET
  description = COALESCE(tags.description, EXCLUDED.description);
