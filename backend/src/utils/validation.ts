import { z } from 'zod';

export const DOMSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  timestamp: z.number(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  elements: z.array(z.any()),
  trigger: z.string(),
});

export const CapturePayloadSchema = z.object({
  url: z.string(),
  title: z.string(),
  timestamp: z.number(),
  domSnapshot: DOMSnapshotSchema,
  screenshotB64: z.string().optional(),
  recentEvents: z.array(z.any()).optional(),
  compressed: z.boolean().default(false),
  metadata: z.any().optional(),
});

export type CapturePayload = z.infer<typeof CapturePayloadSchema>;
export type DOMSnapshot = z.infer<typeof DOMSnapshotSchema>;
