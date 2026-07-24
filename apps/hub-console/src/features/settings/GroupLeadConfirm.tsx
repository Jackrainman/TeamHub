import { useMemo, useState } from 'react';
import { deriveLeafGroups, type Group, type MemberPublic } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { Select } from '../../components/Select';
import { humanizeFormError } from '../../utils';

/**
 * 确认各组组长（ROSTER-CSV-3COL 公测补强刀③ + SETUP-WIZARD-ROSTER 刀② 第④步复用）：逐组从该组
 * 成员里选一名组长（role→groupAdmin）。规则（2026-07-24 用户拍板）：
 *  - **有成员的组必须选**——默认建议该组现任组长 ?? 该组第一行成员（消灭"留空头疼"，下拉恒有值）；
 *  - **没录入人的组不出现**（= 暂时空着自然成立，下游 K2 空候选引导兜底）；
 *  - **组候选 = 叶子组**（复用 contracts `deriveLeafGroups`——结构派生已排除非叶子组「程序」与
 *    哨兵组「全组联调」，不造新过滤逻辑）。
 * 任命只把所选成员升为 groupAdmin，**不降级该组既有组长**（多组长本就合法，设置页可手调——最小写面）。
 * 两处消费：设置页名册导入完成后（刀③）、全屏初始化门第③步（刀②）。
 */
export function GroupLeadConfirm({
  client,
  members,
  groups,
  onConfirmed,
}: {
  client: HubApiClient;
  members: readonly MemberPublic[];
  groups: readonly Group[];
  onConfirmed: () => void;
}) {
  const { t } = useI18n();
  // 候选组 = 叶子组（deriveLeafGroups 结构派生）且有成员（空组不出现）。
  const candidateGroups = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id) && members.some((m) => m.groupId === g.id));
  }, [groups, members]);
  // 默认建议：该组现任组长 ?? 该组第一行成员（members 数组序 = 名册序）。
  const defaultLead = (groupId: string): string => {
    const inGroup = members.filter((m) => m.groupId === groupId);
    return inGroup.find((m) => m.role === 'groupAdmin')?.id ?? inGroup[0]?.id ?? '';
  };
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const selected = (groupId: string): string => selections[groupId] ?? defaultLead(groupId);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // 逐组任命（已是 groupAdmin 的跳过，免无谓写）。串行小批（家庭影院级，组数 ≤ 个位数）。
      for (const g of candidateGroups) {
        const id = selected(g.id);
        const target = members.find((m) => m.id === id);
        if (target && target.role !== 'groupAdmin') {
          await client.setMemberRole(id, { role: 'groupAdmin' });
        }
      }
      onConfirmed();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  // 全部组都没录人 → 不出现（空组自然空着，下游 K2 空候选引导兜底）。
  if (candidateGroups.length === 0) return null;

  return (
    <div className="lead-confirm">
      <strong>{t('settings.leads.title')}</strong>
      <p className="settings-desc">{t('settings.leads.desc')}</p>
      <div className="lead-confirm__rows">
        {candidateGroups.map((g) => {
          const inGroup = members.filter((m) => m.groupId === g.id);
          return (
            <div className="lead-confirm__row" key={g.id}>
              <span className="lead-confirm__group">{g.name}</span>
              <Select
                value={selected(g.id)}
                onChange={(id) => setSelections((prev) => ({ ...prev, [g.id]: id }))}
                options={inGroup.map((m) => m.id)}
                renderOption={(id) =>
                  inGroup.find((m) => m.id === id)?.displayName ?? id
                }
                ariaLabel={t('settings.leads.rowLabel', { group: g.name })}
                disabled={pending}
              />
            </div>
          );
        })}
      </div>
      <div className="lead-confirm__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => void submit()}
          disabled={pending}
        >
          {pending ? t('settings.leads.submitting') : t('settings.leads.submit')}
        </button>
      </div>
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'settings.leads.error')}
        </p>
      ) : null}
    </div>
  );
}
