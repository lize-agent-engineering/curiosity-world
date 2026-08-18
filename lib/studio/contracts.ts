/**
 * Shared contracts for Curiosity Studio: the agent outputs, the stored records,
 * and the app-kind vocabulary that routes prompts.
 *
 * The one rule that shapes everything here: classification routes, it never
 * gates. An `appKind` the planner invents is normalized to `general` rather than
 * failing the request, because the cost of a wrong bucket is a less specific
 * prompt, while the cost of a rejection is a user who cannot build their app.
 */

import { z } from 'zod';

export const STUDIO_APP_KINDS = [
  'tool',
  'game',
  'dashboard',
  'content',
  'form',
  'creative',
  'general',
] as const;

export type StudioAppKind = (typeof STUDIO_APP_KINDS)[number];

export const studioAppKindSchema = z.enum(STUDIO_APP_KINDS);

/** Route an arbitrary model-supplied label to a known kind; unknown → `general`. */
export function normalizeStudioAppKind(value: unknown): StudioAppKind {
  if (typeof value !== 'string') return 'general';
  const candidate = value.trim().toLowerCase();
  return (STUDIO_APP_KINDS as readonly string[]).includes(candidate)
    ? (candidate as StudioAppKind)
    : 'general';
}

export const STUDIO_AGENT_ROLES = ['studio.planner', 'studio.coder', 'studio.reviewer'] as const;
export type StudioAgentRole = (typeof STUDIO_AGENT_ROLES)[number];

export const STUDIO_EDIT_MODES = ['create', 'patch', 'rewrite'] as const;
export type StudioEditMode = (typeof STUDIO_EDIT_MODES)[number];

const shortText = z.string().trim().min(2).max(160);

/** Exactly what the planner model must return — strict, so structured output can enforce it. */
export const studioPlannerOutputSchema = z.strictObject({
  appName: z.string().trim().min(1).max(40),
  appKind: studioAppKindSchema,
  summary: z.string().trim().min(4).max(220),
  /**
   * What THIS round changes, in one line. `summary` describes the app as a
   * whole; the conversation thread needs the per-round delta, and the planner is
   * the only role that sees both the previous plan and the new request.
   */
  changeNote: z.string().trim().min(2).max(160),
  features: z.array(shortText).min(1).max(8),
  layout: z.string().trim().min(4).max(400),
  interactions: z.array(shortText).min(1).max(8),
  persistence: z.enum(['none', 'local-storage']),
});

/** The stored plan: same shape, but an unknown `appKind` degrades to `general`. */
export const studioPlanSchema = studioPlannerOutputSchema.extend({
  appKind: z.unknown().transform(normalizeStudioAppKind),
});

export type StudioPlan = z.infer<typeof studioPlanSchema>;

export function parseStudioPlan(value: unknown): StudioPlan {
  return studioPlanSchema.parse(value);
}

export const studioReviewSchema = z.strictObject({
  verdict: z.enum(['pass', 'revise']),
  findings: z
    .array(
      z.strictObject({
        severity: z.enum(['blocker', 'minor']),
        area: z.enum(['feature', 'runtime', 'ux', 'visual']),
        detail: z.string().trim().min(4).max(240),
      }),
    )
    .max(8),
});

export type StudioReview = z.infer<typeof studioReviewSchema>;

const projectIdSchema = z.string().regex(/^prj_[a-zA-Z0-9_-]+$/);
const versionIdSchema = z.string().regex(/^ver_[a-zA-Z0-9_-]+$/);
const messageIdSchema = z.string().regex(/^msg_[a-zA-Z0-9_-]+$/);
const jobIdSchema = z.string().regex(/^job_[a-zA-Z0-9_-]+$/);

export const studioRuntimeErrorSchema = z.strictObject({
  errorKind: z.enum(['error', 'resource', 'unhandledrejection', 'console.error']),
  message: z.string().trim().min(1).max(1200),
  occurredAt: z.iso.datetime(),
});

export type StudioRuntimeError = z.infer<typeof studioRuntimeErrorSchema>;

export const studioProjectSchema = z.strictObject({
  id: projectIdSchema,
  title: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  currentVersionId: versionIdSchema.nullable(),
  storeVersion: z.number().int().min(1),
});

export type StudioProject = z.infer<typeof studioProjectSchema>;

export const studioVersionSchema = z.strictObject({
  id: versionIdSchema,
  projectId: projectIdSchema,
  /** null for the first version; otherwise the version this one was edited from. */
  parentVersionId: versionIdSchema.nullable(),
  revision: z.number().int().min(1),
  html: z.string().min(1),
  summary: z.string().trim().min(1).max(400),
  appKind: studioAppKindSchema,
  editMode: z.enum(STUDIO_EDIT_MODES),
  jobId: jobIdSchema,
  runtimeErrors: z.array(studioRuntimeErrorSchema).max(20),
  createdAt: z.iso.datetime(),
  /**
   * The intermediate products of the round that produced this version. They are
   * stored rather than left on the job so the conversation card can still show
   * how this version was made after a reload.
   */
  plan: studioPlannerOutputSchema.optional(),
  review: studioReviewSchema.optional(),
  editBlockFailures: z.array(z.string().max(64)).max(8).optional(),
});

export type StudioVersion = z.infer<typeof studioVersionSchema>;

export const studioMessageSchema = z.strictObject({
  id: messageIdSchema,
  projectId: projectIdSchema,
  role: z.enum(['user', 'agent']),
  text: z.string().trim().min(1).max(4000),
  versionId: versionIdSchema.optional(),
  jobId: jobIdSchema.optional(),
  createdAt: z.iso.datetime(),
});

export type StudioMessage = z.infer<typeof studioMessageSchema>;

export const studioSnapshotSchema = z.strictObject({
  project: studioProjectSchema,
  versions: z.array(studioVersionSchema),
  messages: z.array(studioMessageSchema),
});

export type StudioSnapshot = z.infer<typeof studioSnapshotSchema>;

export function parseStudioSnapshot(value: unknown): StudioSnapshot {
  return studioSnapshotSchema.parse(value);
}
