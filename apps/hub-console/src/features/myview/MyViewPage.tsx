import { useQuery } from '@tanstack/react-query';
import type { DepNode } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { identityCacheKey } from '../../shared/lib/identity-utils';
import { countPostedNodes } from '../../shared/lib/pool-utils';
import { requestProjectView } from '../../shared/lib/project-nav';
import { myViewBlockReasonSource, splitMyTasks } from './myview-utils';

/**
 * 我的视图（MY-VIEW，product-redefine §4.3）：= 我负责的任务 ∩ 未被依赖卡住的。
 *
 * **不重造派生**：直接消费既有 `GET /api/dep-graph`（`toDepGraphView`/`deriveBlockAttributions`
 * 已产出的 `status`/`blockedByLabel`/`unmetNeedLabels`），本页只做两件事——① 按
 * `session.memberId` 过滤出"我"的节点（红线5：只按当前 session 过滤，不提供选择他人的入口）
 * ② 按既有 `status` 把这些节点分成"可动手"（working / freeIdle）与"被卡住"（blockedIdle /
 * gap，卡因沿用 `depgraph.node.blockedBy` / unmetNeedLabels 既有文案先例）。
 *
 * **三态**（红线：匿名模式不炸、不白屏）：
 *  - 匿名模式（`identity.mode!=='identity'`）：整个身份模块不启用，没有"登录=某个人"的概念，
 *    结构上无法过滤"我的任务"——显示"需身份模式"说明，非报错、非空白。
 *  - 身份模式未登录：显示登录引导（登录入口在工具条 `IdentityBar`，本页只提示去点它）。
 *  - 身份模式已登录：按 memberId 过滤 + 分组渲染。
 *
 * 过滤/分组逻辑抽在 `myview-utils.ts`（纯函数，单测覆盖）；本组件只负责三态渲染 + 卡片展示。
 */

export function MyViewPage({
  client,
  source,
  identity,
  onNavigate,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  // 空态"跳挂单池"导航（A2 红线：只在本人视图私显）。
  onNavigate: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  const session = identity.session;

  // Hook 顺序纪律：useQuery 恒调用（Rules of Hooks），用 enabled 而非条件渲染控制是否真发请求
  // ——匿名模式 / 未登录时 enabled=false，零网络请求（同 IdentityBar 的 membersQuery 先例）。
  const query = useQuery({
    queryKey: ['dep-graph', source, identityCacheKey(session)],
    queryFn: () => client.getDepGraph(),
    enabled: identity.mode === 'identity' && session !== null,
  });

  if (identity.mode !== 'identity') {
    return (
      <div className="myview-page">
        {/* 页级空态（VISUAL-VITALITY V2 §4.3）：整页只有一句话时给居中构图，不再横幅浮虚空。 */}
        <div className="state-band state-band--page" role="status">
          {t('myview.needIdentityMode')}
        </div>
      </div>
    );
  }

  if (identity.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('myview.loading')}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="myview-page">
        <div className="state-band state-band--page" role="status">
          {t('myview.needLogin')}
        </div>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('myview.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('myview.error')}
      </div>
    );
  }

  // 本人视图按 session memberId 过滤（红线5，合法例外）；派生逻辑见 myview-utils.ts。
  const { doable, blocked } = splitMyTasks(query.data.nodes, session.memberId);
  const totalMine = doable.length + blocked.length;
  // 挂单池活数（设计 §6，A2 红线）：DepNode ownerId===null 计数，零新请求（体检 D4 最干净挂点）。
  const postedCount = countPostedNodes(query.data.nodes);

  return (
    <div className="myview-page">
      <p className="gaps-intro">{t('myview.intro', { name: session.displayName })}</p>
      {totalMine === 0 ? (
        <div className="pm-coldstart">
          <h3>{t('myview.empty.title')}</h3>
          {/* 给新人不丢人的行动台阶：挂单池里有 N 个活 + "没把握就去问问学长"（私推本人，不上报学长）。 */}
          <p>{t('myview.empty.pool', { n: postedCount })}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              requestProjectView('pool');
              onNavigate('project');
            }}
          >
            {t('myview.empty.goPool')}
          </button>
        </div>
      ) : (
        <>
          <section>
            <h2 className="myview-section-title">
              {t('myview.section.doable', { n: doable.length })}
            </h2>
            {doable.length === 0 ? (
              <p className="gaps-note">{t('myview.doable.empty')}</p>
            ) : (
              <div className="gaps-list">
                {doable.map((node) => (
                  <MyViewCard node={node} kind="doable" key={node.id} />
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="myview-section-title">
              {t('myview.section.blocked', { n: blocked.length })}
            </h2>
            {blocked.length === 0 ? (
              <p className="gaps-note">{t('myview.blocked.empty')}</p>
            ) : (
              <div className="gaps-list">
                {blocked.map((node) => (
                  <MyViewCard node={node} kind="blocked" key={node.id} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MyViewCard({ node, kind }: { node: DepNode; kind: 'doable' | 'blocked' }) {
  const { t } = useI18n();
  // 卡因沿既有阻塞归因先例展示（depgraph.node.blockedBy 文案先例；任务名，非人名，A4）。
  const reasonSource = myViewBlockReasonSource(node);
  const reason =
    reasonSource?.kind === 'blockedBy'
      ? t('depgraph.node.blockedBy', { label: reasonSource.label })
      : reasonSource?.kind === 'unmetNeed'
        ? t('myview.card.unmetNeed', { labels: reasonSource.labels.join('；') })
        : null;
  return (
    <article
      className={`gap-card ${kind === 'blocked' ? 'gap-card--pressing' : 'gap-card--present'}`}
    >
      <header className="gap-card__head">
        <span className="badge">{node.groupName}</span>
        {node.robotTarget ? <span className="gap-card__count">{node.robotTarget}</span> : null}
      </header>
      <p className="gap-card__fact">{node.label}</p>
      {kind === 'blocked' && reason ? (
        <p className="gap-card__fact gap-card__fact--sub">{reason}</p>
      ) : null}
    </article>
  );
}
