#!/usr/bin/env bash
#
# 把仓库脚本装成 git 钩子（D-074 收口）。幂等，可反复跑；clone 后跑一次即可。
#
# 历史 bug：pre-commit.sh 一直只是仓库脚本、**从没装成 git 钩子**（.git/hooks 里只有 *.sample），
# 于是密钥扫描 / 版本号 bump 哨兵从不在 `git commit` 时触发——版本号悄悄漂移、靠事后「补 bump」追。
# 本脚本固化安装,让那道反射真的在每次提交时跑。
#
# 钩子写成 wrapper（非裸 symlink）：裸 symlink 会让 pre-commit.sh 的 BASH_SOURCE 指向 .git/hooks/，
# 把 ROOT_DIR 误算成 .git/——wrapper 用真实路径 exec，绝对可靠。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

hook_dir="$(git rev-parse --git-path hooks)"
mkdir -p "$hook_dir"
target="$hook_dir/pre-commit"

cat > "$target" <<'HOOK'
#!/usr/bin/env bash
# 由 scripts/install-hooks.sh 生成（勿手改）。转发到仓库 scripts/pre-commit.sh。
exec "$(git rev-parse --show-toplevel)/scripts/pre-commit.sh" "$@"
HOOK
chmod +x "$target"

echo "✓ 已装 pre-commit 钩子 → ${target}（转发 scripts/pre-commit.sh）"
echo "  含：密钥扫描 + git diff --check 空白 + 版本号自动 bump 反射（check-version-bump.sh）。"
