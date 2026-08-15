---
kind: canonical-domain
status: active
domain: artifacts
truth_for: artifact-metadata-files-versions-and-evidence
last_reviewed: 2026-08-15
---

# Artifacts 领域

## 1. 职责与边界

Artifacts 管图纸、固件、日志和验证证据的元数据、版本索引、URI 以及服务器文件引用。它是“以后不用找人要文件”的档案入口，不替代 Git、EDA 云端 PDM 或机械原生设计工具。

## 2. 当前行为（CURRENT）

- `ArtifactRef` 支持 kind/name/URI/repo/commit、机构、revision、提交来源、组、赛季、机器人、版本号和子类型。
- 机械等本地文件可写入 `TEAMHUB_ARTIFACT_FILES_DIR`；实体只保存 filename、扩展名、大小、MIME、SHA-256 和上传时间。
- 电路/EDA 可只登记外部 URL；程序代码以 repo/commit 指针引用 Git。
- 组别+赛季+机构形成版本线，robotCode 是适配维度而非版本线父级。
- API 已支持 artifact 列表、登记，以及既有文件上传/下载链路；baseline 可引用其证据。

## 3. 目标结构（TARGET）

- artifacts 拆为 model/requests/policies 与 server module；元数据进入统一 SQLite。
- 文件字节继续通过独立 `FileService` 写目录，不进入 SQLite、Git 或 JSON 字段。
- 上传采用 staging → 校验 → 原子移动 → metadata transaction 的统一基础设施。
- console archive feature 通过本域 hooks/API 工作，不与 PM Page 或全量 client 耦合。

## 4. 领域不变式

- 二进制文件永不进入 SQLite 或 Git；数据库只存索引、校验和和引用。
- 文件名、路径和 MIME 均由服务端校验；客户端不得注入 `storedFile`。
- Git/EDA 仍是其原生事实源，TeamHub 只保存可检索指针和战队发布版本。
- 版本记录 append-oriented；新版本不覆盖旧版本的可恢复性。
- 归档物主键是项目/组/赛季/机构/版本，不按成员聚合。

## 5. 跨域接口

- baseline/checklist 以 artifactId 引用验收证据。
- knowledge 以 artifact/repo/commit 链接作为来源证据。
- resources 提供 season/robotCode 映射；二者是一对多关系，不应共享同一实体。
- PM 可挂 artifact reference，但无权直接操作文件目录。

## 6. 已知陷阱

- `kind`、ownerGroup 等词汇由闭集放宽为 string 后，运行时 VocabularyRegistry 尚未完成。
- 元数据和文件写入尚无统一事务补偿；移动成功但 metadata 失败必须可清理 staging。
- 旧数据可能缺少分组和版本字段，应落“未分组/历史”而不是猜测补值。
- 文档中曾提 MinIO、完整 PLM 和云端自动 pull，均不是 CURRENT。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：artifact module、统一 SQLite metadata 和共享 FileService。
- 统一 filename sanitization、大小/后缀/MIME/SHA 校验和失败清理。
- VocabularyRegistry 只有出现真实租户注入需求时才实施；不得为扩展性预建插件平台。
- 云端 PDM/Git 自动摄入继续后置，当前以明确人工发布/引用为准。
