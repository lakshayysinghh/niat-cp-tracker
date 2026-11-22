import "server-only";
import { z } from "zod";

/**
 * zod schemas for the Codeforces responses this app uses
 * (https://codeforces.com/apiHelp/objects). Unknown fields are stripped;
 * a missing or mistyped field fails loudly so a sync writes nothing.
 */

/** Raw API envelope, before error mapping. */
export const cfEnvelope = z.discriminatedUnion("status", [
  z.object({ status: z.literal("OK"), result: z.unknown() }),
  z.object({ status: z.literal("FAILED"), comment: z.string() }),
]);
export type CfEnvelope = z.infer<typeof cfEnvelope>;

export const cfUser = z.object({
  handle: z.string(),
  rating: z.number().int().optional(),
  maxRating: z.number().int().optional(),
  rank: z.string().optional(),
  maxRank: z.string().optional(),
  lastOnlineTimeSeconds: z.number().int().optional(),
  registrationTimeSeconds: z.number().int().optional(),
});
export type CfUser = z.infer<typeof cfUser>;
export const cfUserInfoResult = z.array(cfUser);

export const cfContest = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.enum(["CF", "IOI", "ICPC"]),
  phase: z.string(),
  frozen: z.boolean().optional(),
  durationSeconds: z.number().int(),
  startTimeSeconds: z.number().int().optional(),
  relativeTimeSeconds: z.number().int().optional(),
  preparedBy: z.string().optional(),
  kind: z.string().optional(),
});
export type CfContest = z.infer<typeof cfContest>;
export const cfContestListResult = z.array(cfContest);

export const cfProblem = z.object({
  contestId: z.number().int().optional(),
  index: z.string(),
  name: z.string(),
  type: z.string(),
  points: z.number().optional(),
  rating: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
});
export type CfProblem = z.infer<typeof cfProblem>;

export const cfParticipantType = z.enum([
  "CONTESTANT",
  "PRACTICE",
  "VIRTUAL",
  "MANAGER",
  "OUT_OF_COMPETITION",
]);
export type CfParticipantType = z.infer<typeof cfParticipantType>;

export const cfParty = z.object({
  contestId: z.number().int().optional(),
  members: z.array(z.object({ handle: z.string(), name: z.string().optional() })),
  participantType: cfParticipantType,
  teamId: z.number().int().optional(),
  teamName: z.string().optional(),
  ghost: z.boolean(),
  room: z.number().int().optional(),
  startTimeSeconds: z.number().int().optional(),
});

export const cfProblemResult = z.object({
  points: z.number(),
  penalty: z.number().int().optional(),
  rejectedAttemptCount: z.number().int(),
  type: z.enum(["PRELIMINARY", "FINAL"]),
  bestSubmissionTimeSeconds: z.number().int().optional(),
});

export const cfRanklistRow = z.object({
  party: cfParty,
  rank: z.number().int(),
  points: z.number(),
  penalty: z.number().int(),
  successfulHackCount: z.number().int(),
  unsuccessfulHackCount: z.number().int(),
  problemResults: z.array(cfProblemResult),
  lastSubmissionTimeSeconds: z.number().int().optional(),
});
export type CfRanklistRow = z.infer<typeof cfRanklistRow>;

export const cfStandingsResult = z.object({
  contest: cfContest,
  problems: z.array(cfProblem),
  rows: z.array(cfRanklistRow),
});
export type CfStandings = z.infer<typeof cfStandingsResult>;

// ---------------------------------------------------------------- Phase 5: practice

/** user.status: one submission. participantType kept as a string so practice data never fails on a new type. */
export const cfSubmission = z.object({
  id: z.number().int(),
  contestId: z.number().int().optional(),
  creationTimeSeconds: z.number().int(),
  problem: z.object({
    contestId: z.number().int().optional(),
    index: z.string(),
    name: z.string(),
    rating: z.number().int().optional(),
    tags: z.array(z.string()).default([]),
  }),
  author: z.object({ participantType: z.string(), members: z.array(z.object({ handle: z.string() })).default([]) }),
  verdict: z.string().optional(),
});
export type CfSubmission = z.infer<typeof cfSubmission>;
export const cfUserStatusResult = z.array(cfSubmission);

/** user.rating: one official rating change. */
export const cfRatingChange = z.object({
  contestId: z.number().int(),
  contestName: z.string(),
  ratingUpdateTimeSeconds: z.number().int(),
  oldRating: z.number().int(),
  newRating: z.number().int(),
});
export const cfUserRatingResult = z.array(cfRatingChange);
