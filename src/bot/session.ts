import type { BaseMessage } from "@langchain/core/messages";

/**
 * A mutation (create/update/delete) the model proposed and that is now waiting
 * for the user to confirm with "sí"/"no". The args have already been validated
 * and a human-readable `preview` was shown, so confirming just runs the tool.
 */
export interface PendingMutation {
  /** Tool name the model requested, e.g. "create_item". */
  tool: string;
  /** Validated args the model supplied for that tool. */
  args: Record<string, unknown>;
  /** The preview text the user was asked to confirm. */
  preview: string;
}

/** In-memory conversation state for a single Telegram chat. */
export interface ChatSession {
  /** Rolling, distilled history (alternating user/assistant text) for context. */
  history: BaseMessage[];
  /** A mutation awaiting confirmation, if any. */
  pending?: PendingMutation;
  /** Last activity timestamp (ms) for idle eviction. */
  lastSeen: number;
}

/** Max messages kept per chat so prompts stay bounded. */
const MAX_HISTORY = 20;
/** Drop a chat's state after this much idle time (30 minutes). */
const TTL_MS = 30 * 60 * 1000;

const sessions = new Map<number, ChatSession>();

/** Get (or lazily create) the session for a chat, evicting stale ones. */
export function getSession(chatId: number): ChatSession {
  const now = Date.now();
  let session = sessions.get(chatId);
  if (session && now - session.lastSeen > TTL_MS) {
    sessions.delete(chatId);
    session = undefined;
  }
  if (!session) {
    session = { history: [], lastSeen: now };
    sessions.set(chatId, session);
  }
  session.lastSeen = now;
  return session;
}

/**
 * Append a clean user/assistant exchange to the rolling history and trim it.
 * Only distilled text is kept (never raw tool-call messages), so the next turn
 * never sends a dangling tool_call the model must answer.
 */
export function remember(
  session: ChatSession,
  userText: string,
  assistantText: string,
  factory: {
    human: (text: string) => BaseMessage;
    ai: (text: string) => BaseMessage;
  }
): void {
  session.history.push(factory.human(userText), factory.ai(assistantText));
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }
}

export function clearPending(session: ChatSession): void {
  session.pending = undefined;
}
