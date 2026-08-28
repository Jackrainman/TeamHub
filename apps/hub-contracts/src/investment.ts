import { z } from 'zod';

/** 高时间积累=需要"感觉"的技术（调参手感/装配经验），突击无效、只能早开始摊。 */
export const InvestmentTimeAccumulationSchema = z.enum(['high', 'low']);
/** 未来赛季×高价值（如 sim2real）=最容易被砍、重点保护对象。 */
export const InvestmentHorizonSchema = z.enum(['season', 'future']);
export const InvestmentValueSchema = z.enum(['high', 'low']);

export type InvestmentTimeAccumulation = z.infer<typeof InvestmentTimeAccumulationSchema>;
export type InvestmentHorizon = z.infer<typeof InvestmentHorizonSchema>;
export type InvestmentValue = z.infer<typeof InvestmentValueSchema>;

export const TaskInvestmentSchema = z.object({
  horizon: InvestmentHorizonSchema,
  value: InvestmentValueSchema,
  timeAccumulation: InvestmentTimeAccumulationSchema,
});

export type TaskInvestment = z.infer<typeof TaskInvestmentSchema>;
