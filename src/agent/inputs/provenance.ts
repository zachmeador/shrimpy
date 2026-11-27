import {
  isChat,
  isOccurrence,
  isProcess,
  MAX_BREADCRUMBS_PER_INPUT,
  type Outstanding,
} from "./input.ts";

/** One omission or truncation recorded when assembling an input for the model. */
export type StoredInputOmission =
  | {
      kind: "backlog_cut";
      cut: number;
      atLeast: boolean;
      budgetChars: number;
      usedChars: number;
      clipped: boolean;
    }
  | { kind: "breadcrumb_deferred"; deferred: number; limit: number }
  | { kind: "breadcrumb_truncated"; file: string; limitChars: number; originalChars: number }
  | { kind: "output_truncated"; source: "trigger_check" | "process_wake"; label: string; reason: string };

/** Budgets and omissions captured when an input was taken up for its session. */
export type InputProvenance = {
  source: "chat" | "trigger" | "process" | "watch";
  backlogBudgetChars: number | null;
  backlogUsedChars: number | null;
  breadcrumbsShown: number;
  breadcrumbsLimit: number | null;
  omissions: StoredInputOmission[];
};

/** Extract structured budget and omission facts from an admitted input. */
export function inputProvenanceOf(outstanding: Outstanding): InputProvenance {
  const source: InputProvenance["source"] = isChat(outstanding)
    ? "chat"
    : isOccurrence(outstanding)
      ? "trigger"
      : isProcess(outstanding)
        ? "process"
        : "watch";
  const omissions: StoredInputOmission[] = [];
  let backlogBudgetChars: number | null = null;
  let backlogUsedChars: number | null = null;

  if (isChat(outstanding) && outstanding.backlog !== undefined) {
    const { backlog } = outstanding;
    backlogBudgetChars = backlog.budgetChars ?? null;
    backlogUsedChars = backlog.usedChars ?? null;
    const clipped = backlog.messages.some((message) => message.kind === "posted" && message.clipped === true);
    if (backlog.cut > 0 || clipped) {
      omissions.push({
        kind: "backlog_cut",
        cut: backlog.cut,
        atLeast: backlog.atLeast === true,
        budgetChars: backlog.budgetChars ?? 20_000,
        usedChars: backlog.usedChars ?? 0,
        clipped,
      });
    }
  }

  const crumbs = outstanding.breadcrumbs;
  const breadcrumbsShown = crumbs?.files.length ?? 0;
  const breadcrumbsLimit = crumbs === undefined ? null : MAX_BREADCRUMBS_PER_INPUT;
  if (crumbs !== undefined) {
    if (crumbs.more !== undefined && crumbs.more > 0) {
      omissions.push({ kind: "breadcrumb_deferred", deferred: crumbs.more, limit: MAX_BREADCRUMBS_PER_INPUT });
    }
    for (const file of crumbs.files) {
      if (file.truncated === true) {
        omissions.push({
          kind: "breadcrumb_truncated",
          file: `breadcrumbs/${file.name}`,
          limitChars: file.limitChars ?? 1_000,
          originalChars: file.originalChars ?? file.text.length,
        });
      }
    }
  }

  if (isOccurrence(outstanding) && outstanding.occurrence.outputTruncated === true) {
    omissions.push({
      kind: "output_truncated",
      source: "trigger_check",
      label: outstanding.occurrence.trigger ?? "one-time trigger",
      reason: "check output cut at character limit",
    });
  }

  if (isProcess(outstanding) && outstanding.process.outputTruncated === true) {
    omissions.push({
      kind: "output_truncated",
      source: "process_wake",
      label: outstanding.process.id,
      reason: "process wake output cut to tail budget",
    });
  }

  return { source, backlogBudgetChars, backlogUsedChars, breadcrumbsShown, breadcrumbsLimit, omissions };
}
