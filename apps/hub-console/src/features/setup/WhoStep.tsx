import { useMemo, useState, type FormEvent } from 'react';
import {
  deriveLeafGroups,
  type Group,
  type MemberGrade,
  type MemberPublic,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { GRADE_KEY } from '../../shared/roster';
import { WHO_GRADE_OPTIONS } from './setup-utils';

// ① 你是谁：姓名 + 所在组 + 年级下拉（GRADE-7-TIERS 刀⑥ 七档，默认大一）+ 组长申报 + 项目管理旗标 +
// PIN → bootstrap 一笔落库（建人/认领 + 授旗 + 设 PIN + 登录态）。姓名命中既有成员 = 直接认领该行
// （组/年级字段不显示、服务端忽略）。
export function WhoStep({
  client,
  members,
  groups,
  onDone,
}: {
  client: HubApiClient;
  members: readonly MemberPublic[];
  groups: readonly Group[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  // 所在组候选 = 叶子组（deriveLeafGroups 结构派生，排非叶子+哨兵）；空板无组 → 自由文本输入。
  const leafGroups = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id));
  }, [groups]);
  const [groupName, setGroupName] = useState('');
  const [grade, setGrade] = useState<MemberGrade>('freshman');
  const [asLead, setAsLead] = useState(false);
  const [pm, setPm] = useState(true);
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const nameTrim = name.trim();
  // 姓名命中既有成员 = 认领（无需组）；否则必须给组（新建成员行）。
  const claiming = members.some((m) => m.displayName === nameTrim);
  const valid =
    nameTrim.length > 0 &&
    (claiming || groupName.trim().length > 0) &&
    pin.trim().length >= 8 &&
    !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      await client.setupSuperAdmin({
        pin: pin.trim(),
        displayName: nameTrim,
        groupName: claiming ? undefined : groupName.trim(),
        grade: claiming ? undefined : grade, // 认领路径不动既有行 grade（服务端忽略）
        asGroupLead: asLead,
        projectManager: pm,
      });
      onDone();
    } catch (err) {
      if (/\b409\b/.test(String(err))) {
        onDone();
        return;
      }
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.who')}</h2>
      <p className="setup-card__desc">{t('gate.who.desc')}</p>
      <form onSubmit={(e) => void submit(e)}>
        <label className="gate-field">
          <span>{t('gate.who.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gate.who.namePlaceholder')}
            required
          />
        </label>
        {nameTrim && claiming ? (
          <p className="settings-desc">{t('gate.who.claimHint')}</p>
        ) : null}
        {!claiming ? (
          <label className="gate-field">
            <span>{t('gate.who.group')}</span>
            {leafGroups.length > 0 ? (
              <>
                {/* ONBOARD-QA chips：叶子组点选即填；仍可手打新组名（自动建组）。 */}
                <div className="setup-chips">
                  {leafGroups.map((g) => (
                    <button
                      type="button"
                      className={`setup-chip${groupName === g.name ? ' setup-chip--active' : ''}`}
                      key={g.id}
                      onClick={() => setGroupName(g.name)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t('gate.who.groupPlaceholder')}
                />
              </>
            ) : (
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t('gate.who.groupPlaceholder')}
              />
            )}
          </label>
        ) : null}
        {!claiming ? (
          <label className="gate-field">
            <span>{t('gate.who.grade')}</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as MemberGrade)}
            >
              {WHO_GRADE_OPTIONS.map((g) => (
                <option value={g} key={g}>
                  {t(GRADE_KEY[g])}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!claiming ? (
          <label className="setup-card__check">
            <input
              type="checkbox"
              checked={asLead}
              onChange={(e) => setAsLead(e.target.checked)}
            />
            <span>{t('gate.who.asLead')}</span>
          </label>
        ) : null}
        <label className="setup-card__check">
          <input type="checkbox" checked={pm} onChange={(e) => setPm(e.target.checked)} />
          <span>{t('gate.who.pm')}</span>
        </label>
        <label className="gate-field">
          <span>{t('gate.who.pin')}</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t('gate.who.pinPlaceholder')}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!valid}>
          {pending ? t('gate.who.submitting') : t('gate.who.submit')}
        </button>
        {error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(error, t, 'gate.who.error')}
          </p>
        ) : null}
      </form>
    </section>
  );
}
