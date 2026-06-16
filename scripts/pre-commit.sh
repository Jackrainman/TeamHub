#!/usr/bin/env bash
#
# TeamHub pre-commit 门（feiyue CLAUDE.md 铁律 #5：密钥绝不进仓）。
#
# 安装为 git 钩子：  ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
# 手动跑：          bash scripts/pre-commit.sh
#
# 默认（快，钩子用）：1) 暂存新增行密钥扫描   2) git diff --check 空白错误
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

# 3) 可选总闸：三包 verify:all（typecheck + test + build）。
if [[ "${PRE_COMMIT_VERIFY:-0}" == "1" ]]; then
  for pkg in hub-contracts hub-server hub-console; do
    echo "== verify:all $pkg"
    npm --prefix "apps/$pkg" run verify:all
  done
fi

if [[ "$fail" == "0" ]]; then
  echo "✓ pre-commit 通过"
else
  echo "pre-commit 失败" >&2
  exit 1
fi
