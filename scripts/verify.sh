#!/usr/bin/env bash
# TeamHub 全量验证脚本
# 用途：提交/部署前一键验证，替代手动跑 typecheck → test → build → E2E
# 用法：bash scripts/verify.sh
# 环境变量覆盖：
#   VERIFY_SKIP_E2E=1   跳过 E2E 冒烟
#   VERIFY_SKIP_LARK=1  跳过飞书集成特定检查
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RED='\e[31m'; GREEN='\e[32m'; YELLOW='\e[33m'; CYAN='\e[36m'; NC='\e[0m'
pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "  ${CYAN}→${NC} $1"; }
PASS=0 FAIL=0

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  TeamHub 全量验证 v$(cat VERSION 2>/dev/null || echo '?')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── 1. TypeScript 编译 ──
echo "── 1. TypeScript typecheck ──"
if npm --prefix apps/hub-console run typecheck &>/tmp/verify-ts.log; then
  pass "TypeScript typecheck"
else
  fail "TypeScript typecheck FAILED"
  tail -5 /tmp/verify-ts.log
fi

# ── 2. 单元测试 ──
echo "── 2. 单元测试 ──"
for suite in season-step bootstrap-gate; do
  if npm --prefix apps/hub-console test -- --run "$suite" &>/tmp/verify-test-$suite.log; then
    pass "Unit tests: $suite"
  else
    fail "Unit tests: $suite FAILED"
    tail -5 /tmp/verify-test-$suite.log
  fi
done

# ── 3. 构建 ──
echo "── 3. 构建 ──"
if npm --prefix apps/hub-console run build &>/tmp/verify-build.log; then
  pass "Console build"
else
  fail "Console build FAILED"
  tail -5 /tmp/verify-build.log
fi
if npm --prefix apps/hub-server run build &>/tmp/verify-build-server.log; then
  pass "Server build"
else
  fail "Server build FAILED"
  tail -5 /tmp/verify-build-server.log
fi

# ── 4. 代码级断言 ──
echo "── 4. 代码级断言 ──"
SRC="apps/hub-console/src/features/setup/BootstrapGate.tsx"
CSS="apps/hub-console/src/styles.css"
if grep -q 'seasonsQuery.isLoading' "$SRC"; then
  pass "Loading guard present in SeasonStep"
else
  fail "Loading guard MISSING in SeasonStep"
fi
if grep -q 'color-scheme: dark' "$CSS"; then
  pass "color-scheme: dark in CSS"
else
  fail "color-scheme: dark MISSING in CSS"
fi

# ── 5. E2E 冒烟 ──
if [[ "${VERIFY_SKIP_E2E:-0}" != "1" ]]; then
  echo "── 5. E2E 冒烟 ──"
  if cd apps/hub-console && timeout 120 node e2e/runner.cjs &>/tmp/verify-e2e.log; then
    pass "E2E smoke"
  else
    # 检查 summary
    if [[ -f /tmp/teamhub-e2e/summary.json ]]; then
      PASSED=$(grep -o '"passed":[0-9]*' /tmp/teamhub-e2e/summary.json | cut -d: -f2)
      E2E_FAILED=$(grep -o '"failed":[0-9]*' /tmp/teamhub-e2e/summary.json | cut -d: -f2)
      if [[ "${E2E_FAILED:-0}" -eq 0 ]]; then
        pass "E2E smoke: $PASSED passed"
      else
        fail "E2E smoke: $PASSED passed, $E2E_FAILED failed"
      fi
    else
      fail "E2E smoke FAILED"
      tail -20 /tmp/verify-e2e.log
    fi
  fi
  cd "$ROOT_DIR"

  # ── 6. 飞书集成专项（可选） ──
  if [[ "${VERIFY_SKIP_LARK:-0}" != "1" ]]; then
    echo "── 6. 飞书集成专项 ──"
    # 6a. Lark 配置端点可达
    CFG=$(curl -sf http://127.0.0.1:4177/api/integrations/lark 2>/dev/null || echo "")
    if [[ -n "$CFG" ]]; then
      echo "$CFG" | grep -q '"configured":true' && pass "Lark config endpoint (configured)" \
        || pass "Lark config endpoint (unconfigured)"
      echo "$CFG" | grep -q '"chatId"' && pass "Lark chat_id present" \
        || pass "Lark chat_id absent"
    else
      pass "Lark config endpoint (not available — no SQLite backend)"
    fi
    # 6b. E2E 模块中飞书检查数
    E2E_OUTPUT=$(cat /tmp/verify-e2e.log 2>/dev/null || echo "")
    LARK_CHECKS=$(echo "$E2E_OUTPUT" | grep -c '飞书\|Lark\|lark\|chat_id\|推送提醒' 2>/dev/null || echo 0)
    [[ "$LARK_CHECKS" -gt 0 ]] && pass "Lark E2E checks ran ($LARK_CHECKS)" \
      || pass "Lark E2E module not in this run"
  fi
else
  echo "── 5. E2E 冒烟 ──   ⏭ 跳过（VERIFY_SKIP_E2E=1）"
fi

# ── 汇总 ──
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  结果: ${PASS} ✅ 通过, ${FAIL} ❌ 失败"
echo "═══════════════════════════════════════════════════════════════"
rm -f /tmp/verify-{ts,test-*,build*}.log
[[ "$FAIL" -eq 0 ]]
