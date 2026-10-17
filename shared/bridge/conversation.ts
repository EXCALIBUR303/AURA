// Folds one conversation reply's events into a view, in `seq` order.
// Every event of a reply (ai.turnState, ai.chunk, ai.toolActivity,
// ai.approvalRequested, ai.done, ai.error) carries the reply's streamId and
// the next `seq`. This keeps only the next expected one, so duplicates, late
// events of a cancelled reply, and anything after the terminal event are
// ignored. A gap means events were lost: `gap` is set and the page should
// reload the conversation with ai.getConversation.

import type { BridgeError } from "../contracts/errors.ts";
import type { EventPayload } from "../contracts/events.ts";
import type { AIApprovalRequest, AIToolActivity, AITurnState, FinishReason } from "../contracts/domain.ts";

export interface ReplyView {
  streamId: string;
  state: AITurnState;
  /** The reply text so far. Untrusted model output: render as plain text or sanitised markdown without remote content. */
  text: string;
  /** One entry per tool call, updated in place. */
  tools: AIToolActivity[];
  /** The approval the reply is waiting for, if any. Cleared when the reply moves on. */
  approval: AIApprovalRequest | null;
  finishReason: FinishReason | null;
  error: BridgeError | null;
  /** The last `seq` applied. */
  seq: number;
  /** True once the reply has ended (done or error). */
  ended: boolean;
  /** True when an event was missing; reload with ai.getConversation. */
  gap: boolean;
}

export type ReplyEvent =
  | { name: "ai.turnState"; payload: EventPayload<"ai.turnState"> }
  | { name: "ai.chunk"; payload: EventPayload<"ai.chunk"> }
  | { name: "ai.toolActivity"; payload: EventPayload<"ai.toolActivity"> }
  | { name: "ai.approvalRequested"; payload: EventPayload<"ai.approvalRequested"> }
  | { name: "ai.done"; payload: EventPayload<"ai.done"> }
  | { name: "ai.error"; payload: EventPayload<"ai.error"> };

export function newReply(streamId: string): ReplyView {
  return { streamId, state: "idle", text: "", tools: [], approval: null, finishReason: null, error: null, seq: 0, ended: false, gap: false };
}

/** Returns the next view, or the same object when the event does not apply. */
export function applyReplyEvent(view: ReplyView, event: ReplyEvent): ReplyView {
  const { payload } = event;
  if (payload.streamId !== view.streamId || view.ended || payload.seq <= view.seq) return view;
  const next: ReplyView = { ...view, seq: payload.seq, gap: view.gap || payload.seq !== view.seq + 1 };
  switch (event.name) {
    case "ai.turnState":
      next.state = event.payload.state;
      if (event.payload.state !== "waiting_for_approval") next.approval = null;
      break;
    case "ai.chunk":
      next.text = view.text + event.payload.delta;
      break;
    case "ai.toolActivity": {
      const activity = event.payload.activity;
      const index = view.tools.findIndex((item) => item.callId === activity.callId);
      next.tools = index >= 0 ? view.tools.map((item, i) => (i === index ? activity : item)) : [...view.tools, activity];
      break;
    }
    case "ai.approvalRequested":
      next.approval = event.payload.approval;
      break;
    case "ai.done":
      next.finishReason = event.payload.finishReason;
      next.ended = true;
      next.approval = null;
      if (next.state === "idle" || !["completed", "cancelled", "error"].includes(next.state)) {
        next.state = event.payload.finishReason === "cancelled" ? "cancelled" : "completed";
      }
      break;
    case "ai.error":
      next.error = event.payload.error;
      next.finishReason = "error";
      next.state = "error";
      next.ended = true;
      next.approval = null;
      break;
  }
  return next;
}
