/**
 * 入库确认的件号模糊匹配（REIMBURSE-PROC 阶段 5）：报销明细行品名 → 已有 PartType 候选列表。
 * 纯函数零 React，照 shared/lib 惯例由 test/part-match.test.ts 覆盖（「测逻辑不测 DOM」）。
 *
 * 打分（includes 模糊，越高越像）：
 *  - 件号/名称去空白小写后**全等**：100 / 90（最强信号：品名就是件号，如「GM6020」）；
 *  - 件号/名称与品名**互为子串**：60 / 50（「6020 云台电机」含「云台电机」↔ 名称「GM6020 云台电机」）；
 *  - 品名按空白拆词，长度 ≥2 的词被件号/名称包含：每词 +20 / +10
 *    （「M3508 电机」的词「m3508」命中件号——品名带空格修饰语时的兜底信号）。
 * 得分 >0 才入候选，按得分降序、同分按件号字典序（确定性）。候选只是**建议默认值**，
 * 用户可在下拉里改选任何件或「新建件」——匹配错不挡路（AI 转译不拍板）。
 */

/** 匹配候选的最小形状（PartType 结构兼容；测试可传字面量，不拖 schema fixture）。 */
export interface PartMatchCandidate {
  partNumber: string;
  name: string;
}

function compact(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

function scoreCandidate(query: string, tokens: string[], candidate: PartMatchCandidate): number {
  const partNumber = compact(candidate.partNumber);
  const name = compact(candidate.name);
  let score = 0;
  if (partNumber === query) score += 100;
  if (name === query) score += 90;
  // 子串打分要求品名长度 ≥2——单字符品名（如「4」）会被一堆件号包含，纯噪声。
  if (query.length >= 2) {
    if (partNumber !== query && (partNumber.includes(query) || query.includes(partNumber))) {
      score += 60;
    }
    if (name !== query && (name.includes(query) || query.includes(name))) {
      score += 50;
    }
  }
  for (const token of tokens) {
    if (partNumber.includes(token)) score += 20;
    if (name.includes(token)) score += 10;
  }
  return score;
}

export function suggestPartTypeMatch<T extends PartMatchCandidate>(
  itemName: string,
  partTypes: readonly T[],
): T[] {
  const query = compact(itemName);
  if (query === '') {
    return [];
  }
  const tokens = itemName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  return partTypes
    .map((candidate) => ({ candidate, score: scoreCandidate(query, tokens, candidate) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.candidate.partNumber.localeCompare(b.candidate.partNumber),
    )
    .map((hit) => hit.candidate);
}
