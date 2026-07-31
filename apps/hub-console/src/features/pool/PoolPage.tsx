import { useMemo } from 'react';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { useQueryGuard } from '../../shared/QueryGate';
import { useTasks } from '../../hooks/useTasks';
import { useMembers, useGroups } from '../../hooks/useRoster';
import { sortedPostedTasks } from './pool-utils';
import { PoolSearch } from './sub/PoolSearch';
import { PoolCard } from './sub/PoolCard';

/**
 * 挂单池视图（TASK-POST-CLAIM，D-088 设计 §3"过夜登记处" / §6）：项目页第三视图。两块——
 * ① 上：**"看谁做过"关键词搜索**（GET /api/tasks?q=）→ 事实卡结果列表（title/状态/负责人显名/时间），
 *    "找到做过的人，自己去联系"。红线：结果永不聚合成技能画像/花名册，不按人筛选。
 * ② 下：**挂单池**（isPostedTask 过滤、按滞留时长降序）——一键认领（本人/匿名选人）+ 组长指派入口
 *    （owner 选人 + 理由必填）。**滞留=对事可见**（"这单挂两周没人领"），绝无"谁闲着"的按人视图。
 */

export function PoolPage({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);

  const tasksQuery = useTasks(client, source);
  const membersQuery = useMembers(client, 'pool');
  const groupsQuery = useGroups(client, 'pool');

  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];

  const tasksGate = useQueryGuard(tasksQuery, t('pm.loading'), t('pm.error'));
  if (tasksGate.guard) return tasksGate.guard;

  const posted = sortedPostedTasks(tasksGate.data.tasks);

  return (
    <div className="pool-page">
      <PoolSearch client={client} source={source} members={members} />

      <section aria-label={t('pool.list.aria')}>
        <p className="gaps-intro">{t('pool.list.intro', { n: posted.length })}</p>
        {posted.length === 0 ? (
          <div className="pm-coldstart">
            <h3>{t('pool.list.emptyTitle')}</h3>
            <p>{t('pool.list.emptyBody')}</p>
          </div>
        ) : (
          <div className="pool-list">
            {posted.map((task) => (
              <PoolCard
                key={task.id}
                client={client}
                source={source}
                task={task}
                members={members}
                groups={groups}
                identity={identity}
                now={now}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
