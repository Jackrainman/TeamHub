import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from '../../common.js';
import {
  ChecklistOriginSchema,
  ChecklistTemplateSchema,
  GateChecklistItemSchema,
  validateChecklistAnchor,
} from './model.js';

export const ChecklistQuerySchema = z.object({
  seasonId: z.string().min(1),
});
export const ChecklistItemsResponseSchema = z.object({
  items: z.array(GateChecklistItemSchema),
});

export const CreateChecklistItemRequestSchema = z
  .object({
    title: z.string().min(1),
    anchorMilestoneId: z.string().min(1).optional(),
    anchorDueAt: isoDateTimeSchema.optional(),
    origin: ChecklistOriginSchema.default('iou'),
    note: z.string().min(1).optional(),
  })
  .superRefine(validateChecklistAnchor);
export const CreateChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

export const ClearChecklistItemRequestSchema = z.object({
  clearedBy: ActorRefSchema.optional(),
});
export const ClearChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

export const WaiveChecklistItemRequestSchema = z.object({
  waivedBy: ActorRefSchema.optional(),
  waiveReason: z.string().min(1),
});
export const WaiveChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

export const ChecklistTemplatesResponseSchema = z.object({
  templates: z.array(ChecklistTemplateSchema),
});

export type ChecklistQuery = z.infer<typeof ChecklistQuerySchema>;
export type ChecklistItemsResponse = z.infer<typeof ChecklistItemsResponseSchema>;
export type CreateChecklistItemRequest = z.infer<typeof CreateChecklistItemRequestSchema>;
export type CreateChecklistItemResponse = z.infer<typeof CreateChecklistItemResponseSchema>;
export type ClearChecklistItemRequest = z.infer<typeof ClearChecklistItemRequestSchema>;
export type ClearChecklistItemResponse = z.infer<typeof ClearChecklistItemResponseSchema>;
export type WaiveChecklistItemRequest = z.infer<typeof WaiveChecklistItemRequestSchema>;
export type WaiveChecklistItemResponse = z.infer<typeof WaiveChecklistItemResponseSchema>;
export type ChecklistTemplatesResponse = z.infer<typeof ChecklistTemplatesResponseSchema>;
