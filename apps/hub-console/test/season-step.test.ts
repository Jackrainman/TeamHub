import { describe, expect, test } from 'vitest';
import {
  CreateSeasonRequestSchema,
  generateRoboconBaselineTemplate,
  UpdateBaselineRequestSchema,
  type Season,
  type UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import {
  buildSeasonCreateRequest,
  seasonAnchorsComplete,
  seasonFormSubmittable,
  seasonNameYear,
  submitSeasonStep,
  suggestSeasonForm,
  type SeasonForm,
} from '../src/features/setup/setup-utils';
import { seasonForYear, seasonYearOptions } from '../src/utils';
import { translations } from '../src/i18n/translations';

/**
 * 初始化向导「赛季」步（WIZARD-SEASON-STEP 打磨轮刀⑬）纯数据单测——不测 DOM/RTL（「测逻辑不测 DOM」，
 * 同 fleet-step.test.ts / kb-step.test.ts 范式）：预填派生 + 可提交/两锚点齐否判定 + 请求体构建 +
 * 提交序列 mock client 断言（建赛季→模板 PATCH 顺序与参数形状）+ i18n 双语键 + 步序号锚点。
 */

/** 记录调用顺序与参数的 mock client（只实现 submitSeasonStep 需要的两个方法）。 */
function mockSeasonClient(season: Season) {
  const calls: string[] = [];
  const createSeasonCalls: unknown[] = [];
  const updateBaselineCalls: { seasonId: string; req: UpdateBaselineRequest }[] = [];
  const client = {
    async createSeason(req: unknown) {
      calls.push('createSeason');
      createSeasonCalls.push(req);
      return { season };
    },
    async updateBaseline(seasonId: string, req: UpdateBaselineRequest) {
      calls.push('updateBaseline');
      updateBaselineCalls.push({ seasonId, req });
      // 回包形状照 UpdateBaselineResponse（读视图剥 passedBy）拼最小合法 baseline——
      // 测试只断言调用顺序与入参，返回体仅满足类型。
      return {
        baseline: {
          id: 'bl-1',
          seasonId,
          anchors: req.anchors ?? {},
          segments: req.segments ?? [],
          phases: req.phases ?? [],
          milestones: (req.milestones ?? []).map(({ passedBy: _p, ...m }) => m),
        },
      };
    },
  };
  return { client, calls, createSeasonCalls, updateBaselineCalls };
}

const SEASON: Season = {
  id: 'sn-2027',
  name: '2027赛季',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2027-07-31T23:59:59.999Z',
  status: 'active',
};

describe('season-step: 预填派生', () => {
  test('8–12 月 → 次年赛季：名/学期开始日期段/结束日全从 suggestSeason 拿，比赛日不预填', () => {
    const form = suggestSeasonForm(new Date(Date.UTC(2026, 8, 15))); // 2026-09
    expect(form).toEqual({
      name: '2027赛季',
      semesterStart: '2026-09-01',
      competitionDate: '',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
  });

  test('1–7 月 → 当年赛季（去年 9 月开赛）', () => {
    const form = suggestSeasonForm(new Date(Date.UTC(2027, 2, 10))); // 2027-03
    expect(form.name).toBe('2027赛季');
    expect(form.semesterStart).toBe('2026-09-01');
    expect(form.endsAt).toBe('2027-07-31T23:59:59.999Z');
  });
});

describe('season-step: 年份下拉选项', () => {
  test('seasonForYear：任意年份 → 名/startsAt/endsAt 钉死', () => {
    expect(seasonForYear(2027)).toEqual({
      name: '2027赛季',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(seasonForYear(2025)).toEqual({
      name: '2025赛季',
      startsAt: '2024-09-01T00:00:00.000Z',
      endsAt: '2025-07-31T23:59:59.999Z',
    });
  });

  test('seasonYearOptions：1–7 月 → suggested=当年，选项 [年-1, 年, 年+1]', () => {
    const opts = seasonYearOptions(new Date(Date.UTC(2026, 6, 16))); // 2026-07
    expect(opts.suggested).toBe(2026);
    expect(opts.years).toEqual([2025, 2026, 2027]);
  });

  test('seasonYearOptions：8–12 月 → suggested=次年', () => {
    const opts = seasonYearOptions(new Date(Date.UTC(2026, 8, 1))); // 2026-09
    expect(opts.suggested).toBe(2027);
    expect(opts.years).toEqual([2026, 2027, 2028]);
  });
});

describe('season-step: seasonNameYear 下拉 value 派生', () => {
  test('赛季名 → 年份数（"2027赛季" → 2027）', () => {
    expect(seasonNameYear('2027赛季')).toBe(2027);
    expect(seasonNameYear('2025赛季')).toBe(2025);
  });

  test('预填赛季名的派生年份必落在下拉选项内（known-bugs 2026-07-28 #3：value 须匹配 option）', () => {
    const now = new Date(Date.UTC(2026, 8, 15)); // 2026-09
    const form = suggestSeasonForm(now);
    const { years } = seasonYearOptions(now);
    expect(years).toContain(seasonNameYear(form.name));
  });
});

describe('season-step: 可提交判定与两锚点齐否', () => {
  const base: SeasonForm = {
    name: '2027赛季',
    semesterStart: '2026-09-01',
    competitionDate: '',
    endsAt: '2027-07-31T23:59:59.999Z',
  };

  test('预填态即可提交（比赛日选填）；空名/空学期开始不可', () => {
    expect(seasonFormSubmittable(base)).toBe(true);
    expect(seasonFormSubmittable({ ...base, name: '  ' })).toBe(false);
    expect(seasonFormSubmittable({ ...base, semesterStart: '' })).toBe(false);
  });

  test('比赛日填了须晚于学期开始（同 BaselineEmptyState orderOk）', () => {
    expect(seasonFormSubmittable({ ...base, competitionDate: '2027-07-15' })).toBe(true);
    expect(seasonFormSubmittable({ ...base, competitionDate: '2026-09-01' })).toBe(false);
    expect(seasonFormSubmittable({ ...base, competitionDate: '2026-08-31' })).toBe(false);
  });

  test('两锚点齐否 = 学期开始 + 比赛日都给了', () => {
    expect(seasonAnchorsComplete(base)).toBe(false);
    expect(seasonAnchorsComplete({ ...base, competitionDate: '2027-07-15' })).toBe(true);
    expect(
      seasonAnchorsComplete({ ...base, semesterStart: '', competitionDate: '2027-07-15' }),
    ).toBe(false);
  });
});

describe('season-step: 请求体构建', () => {
  test('buildSeasonCreateRequest：trim 名、学期开始日期段 → ISO 零点、endsAt 透传；过 contracts schema', () => {
    const req = buildSeasonCreateRequest({
      name: '  2027赛季  ',
      semesterStart: '2026-09-01',
      competitionDate: '',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(req).toEqual({
      name: '2027赛季',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(CreateSeasonRequestSchema.safeParse(req).success).toBe(true);
  });
});

describe('season-step: 提交序列（mock client 断言顺序与参数形状）', () => {
  test('两锚点齐 → createSeason 先、updateBaseline 后（PATCH 要新建赛季 id），模板 = contracts 纯函数产物', async () => {
    const { client, calls, createSeasonCalls, updateBaselineCalls } =
      mockSeasonClient(SEASON);
    const form: SeasonForm = {
      name: '2027赛季',
      semesterStart: '2026-09-01',
      competitionDate: '2027-07-15',
      endsAt: '2027-07-31T23:59:59.999Z',
    };
    const res = await submitSeasonStep(client, form);

    expect(calls).toEqual(['createSeason', 'updateBaseline']);
    expect(createSeasonCalls[0]).toEqual({
      name: '2027赛季',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(updateBaselineCalls).toHaveLength(1);
    expect(updateBaselineCalls[0].seasonId).toBe('sn-2027');
    // 模板形状 = generateRoboconBaselineTemplate 同参数产物（照 BaselineOverview 空态既有调用序列），
    // 且过服务端 PATCH 先验 schema。
    expect(updateBaselineCalls[0].req).toEqual(
      generateRoboconBaselineTemplate({
        semesterStart: '2026-09-01T00:00:00.000Z',
        competitionDate: '2027-07-15T00:00:00.000Z',
      }),
    );
    expect(UpdateBaselineRequestSchema.safeParse(updateBaselineCalls[0].req).success).toBe(
      true,
    );
    expect(res).toEqual({ season: SEASON, baselineGenerated: true });
  });

  test('比赛日空 → 只建赛季，不碰 baseline（进 app 后总览空态可补锚点）', async () => {
    const { client, calls, updateBaselineCalls } = mockSeasonClient(SEASON);
    const res = await submitSeasonStep(client, {
      name: '2027赛季',
      semesterStart: '2026-09-01',
      competitionDate: '',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(calls).toEqual(['createSeason']);
    expect(updateBaselineCalls).toHaveLength(0);
    expect(res).toEqual({ season: SEASON, baselineGenerated: false });
  });
});

describe('season-step: i18n 双语键与步序号锚点', () => {
  test('gate.season.* / gate.step.season 键 zh+en 齐全且非空', () => {
    const keys = [
      'gate.step.season',
      'gate.season.desc',
      'gate.season.hasSeason',
      'gate.season.name',
      'gate.season.semesterStart',
      'gate.season.competitionDate',
      'gate.season.competitionHint',
      'gate.season.dateOrder',
      'gate.season.submit',
      'gate.season.submitting',
      'gate.season.createdWithBaseline',
      'gate.season.createdNoBaseline',
      'gate.season.next',
      'gate.season.skip',
      'gate.season.error',
    ] as const;
    for (const key of keys) {
      expect(translations.zh[key], `zh ${key}`).toBeTruthy();
      expect(translations.en[key], `en ${key}`).toBeTruthy();
    }
    // 插值参数双语都在模板里。
    for (const key of [
      'gate.season.hasSeason',
      'gate.season.createdWithBaseline',
      'gate.season.createdNoBaseline',
    ] as const) {
      expect(translations.zh[key]).toContain('{name}');
      expect(translations.en[key]).toContain('{name}');
    }
    expect(translations.zh['gate.season.error']).toContain('{detail}');
    expect(translations.en['gate.season.error']).toContain('{detail}');
  });

  test('步序号同步：subtitle 七步、season ④/(4) 插在 leads 与 fleet 之间、done ⑧/(8)', () => {
    expect(translations.zh['gate.subtitle']).toContain('七步');
    expect(translations.en['gate.subtitle']).toContain('Seven steps');
    expect(translations.zh['gate.step.season']).toBe('④ 建赛季');
    expect(translations.en['gate.step.season']).toBe('(4) Create the season');
    expect(translations.zh['gate.step.fleet']).toContain('⑤');
    expect(translations.en['gate.step.fleet']).toContain('(5)');
    expect(translations.zh['gate.done.title']).toBe('⑧ 完成');
    expect(translations.en['gate.done.title']).toBe('(8) Done');
  });
});
