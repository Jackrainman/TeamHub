import { z } from 'zod';
import { MemberGradeSchema, MemberPublicSchema, MemberRoleSchema } from '../tasks/model.js';

export const SessionIdentitySchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  groupId: z.string().min(1),
  role: MemberRoleSchema,
  gateReviewer: z.boolean().optional(),
  projectManager: z.boolean().optional(),
});
export const SessionRequestSchema = z.object({ username: z.string().min(1), pin: z.string().min(1).optional() });
export const SessionResponseSchema = z.object({
  mode: z.enum(['anonymous', 'identity']),
  session: SessionIdentitySchema.nullable(),
  mustSetPin: z.boolean().optional(),
});
export const SetPinRequestSchema = z.object({ pin: z.string().min(8).max(64) });
export const SetPinResponseSchema = z.object({ member: MemberPublicSchema });
export const ClearPinResponseSchema = SetPinResponseSchema;
export const SetupSuperAdminRequestSchema = z.object({
  pin: z.string().min(8).max(64),
  displayName: z.string().trim().min(1).optional(),
  groupName: z.string().trim().min(1).optional(),
  asGroupLead: z.boolean().optional(),
  projectManager: z.boolean().optional(),
  grade: MemberGradeSchema.optional(),
});
export const SetupSuperAdminResponseSchema = SetPinResponseSchema;
export type SessionIdentity = z.infer<typeof SessionIdentitySchema>;
export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type SetPinRequest = z.infer<typeof SetPinRequestSchema>;
export type SetPinResponse = z.infer<typeof SetPinResponseSchema>;
export type ClearPinResponse = SetPinResponse;
export type SetupSuperAdminRequest = z.infer<typeof SetupSuperAdminRequestSchema>;
export type SetupSuperAdminResponse = SetPinResponse;
