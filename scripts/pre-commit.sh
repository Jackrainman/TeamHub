#!/usr/bin/env bash
#
# TeamHub pre-commit 门（feiyue CLAUDE.md 铁律 #5：密钥绝不进仓）。
#
# 安装为 git 钩子：  bash scripts/install-hooks.sh   （clone 后跑一次；幂等）
# 手动跑：          bash scripts/pre-commit.sh
#
# 默认（快，钩子用）：1) 暂存新增行密钥扫描   2) git diff --check 空白错误   3) 文档/软件架构门
# PRE_COMMIT_VERIFY=1：额外跑三包 verify:all（慢；CI 缺位时的本地总闸，AGENTS §4 验证门）
#
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
fail=0

# 1) 密钥扫描：暂存的**新增行**里禁止 sk-... 形态密钥。字符类含 -/_，故现代前缀
#    （Anthropic sk-ant-api03-…、OpenAI sk-proj-…）与 legacy sk-…(OpenAI/DeepSeek) 一并命中——
#    旧版 [A-Za-z0-9] 不含连字符会漏掉 sk-ant-/sk-proj- 整类，是真漏洞。
secret_hits="$(git diff --cached -U0 --no-color | grep -E '^\+' | grep -nE 'sk-[A-Za-z0-9_-]{20,}' || true)"
if [[ -n "$secret_hits" ]]; then
  echo "✗ 暂存改动疑似含密钥（sk-...），拒绝提交：" >&2
  echo "$secret_hits" >&2
  echo "  密钥只存浏览器 GM / 运行环境变量，绝不进仓（feiyue 铁律 #5）。" >&2
  fail=1
fi

# 2) 空白错误（行尾空格 / 混合缩进 / 文件尾空行等）。
if ! git diff --cached --check; then
  echo "✗ git diff --check 报空白错误（见上）。" >&2
  fail=1
fi

# 2.25) 文档结构门（D-091）：活文档单源、archive 五文件、无截图/状态稿。
if ! node scripts/verify-docs-architecture.mjs; then
  echo "✗ 文档架构检查失败（见上）。" >&2
  fail=1
fi

# 2.4) 软件架构门（D-090）：单 workspace/lock/version、依赖方向与旧架构精确迁移基线。
if ! node scripts/verify-architecture.mjs; then
  echo "✗ 软件架构检查失败（见上）。" >&2
  fail=1
fi

# 2.5) 版本号 bump 哨兵（D-074）：改了 hub-* 源码却没动 VERSION → 提醒。
#      默认 warn（不阻断 D-064 无人值守环）；VERSION_BUMP_STRICT=1 升硬门则 exit 1 → fail。
if ! bash scripts/check-version-bump.sh; then
  fail=1
fi

# 3) 强制总闸：三包 verify:all（typecheck + test + build）。
#    默认每次 commit 必跑（D-xxx 强制测试门；防止「改了 src 不验证就提交」）。
#    万一需要临时跳过（CI 已跑过/验证耗时长）→ PRE_COMMIT_SKIP_VERIFY=1。
#    任一 verify 失败（exit 非0 → set -e 中断，fail 置１）即拒提交。
#    若后续某包 verify 脚本本身报错，走 verify 脚本升级（见 todo）而不是放宽本门。
if [[ "${PRE_COMMIT_SKIP_VERIFY:-0}" != "1" ]]; then
  for pkg in hub-contracts hub-server hub-console; do
    echo "== verify:all $pkg"
    if ! npm --prefix "apps/$pkg" run verify:all; then
      echo "✗ .pkg($pkg) verify:all 失败，拒绝提交" >&2
      fail=1
    fi
  done
fi

if [[ "$fail" == "0" ]]; then
  echo "✓ pre-commit 通过"
else
  echo "pre-commit 失败" >&2
  exit 1
fi
