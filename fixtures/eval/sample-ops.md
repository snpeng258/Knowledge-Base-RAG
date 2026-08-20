# 本地依赖启动备忘（脱敏 fixture）

开发机用 Docker Compose 拉起 PostgreSQL。compose 文件里声明健康检查，应用只连 `127.0.0.1`。

镜像使用官方 pgvector 的 pg16 标签。不要默认打开 GPU 推理容器。磁盘数据放在项目内的绑定目录，重启容器不应要求删卷。
