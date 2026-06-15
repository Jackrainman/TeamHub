---
date: 2026-06-14
project: TeamHub hub-server
relatedFiles: [src/store/file-kb-store.js]
---

# FileKbStore 写链一次失败后静默跳过后续写（审计 H2）

**症状**：
- FileKbStore.persist 串行写链中某一次落盘失败后，后续 closeout 写入被静默跳过、真数据丢失，调用方却以为成功。

**根因**：
- persist 推进写链版本时未隔离失败，promise 链一旦进入 rejected 态，后续 await 全部短路、不再真正写盘。

**修复方案**：
- persist 把推进写链的那步 .catch 隔离失败（reset 为 resolved），不再静默跳过后续写；调用方仍拿到真实错误。
- writeOnce 失败时清掉残留 .tmp 文件。

**预防**：
- 串行写链（promise chain）的每一环失败都必须隔离，不能让一次 reject 毒化整条链。
- 「写成功」必须以真落盘为准，不能因链状态短路就上报成功（§10 不谎报）。
