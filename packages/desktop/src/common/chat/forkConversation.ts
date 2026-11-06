/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-fork capability as projected on the conversation DETAIL response
 * (`ConversationResponse.fork_capability`). Sourced server-side from
 * `agent_metadata.agent_capabilities.session_capabilities.fork`; absent =
 * the agent declares no native fork support. The latest message can still
 * start an independent conversation using a concise handoff.
 */
export type TForkCapability = { at_turn: boolean };

/**
 * Whether the fork entry point should be shown on one message.
 *
 * - No native capability → latest message only, using a summary handoff.
 * - `at_turn` (codex `thread/fork` + `lastTurnId`) → messages the backend can
 *   actually anchor at: the last message (HEAD fork needs no anchor) or any
 *   message with a turn anchor at-or-before it (`hasTurnAnchor`, mirroring the
 *   server's `resolve_backend_turn_anchor`). Legacy/copied rows without an
 *   anchor would be refused with `FORK_POINT_UNSUPPORTED`, so their entry is
 *   hidden instead of failing on click.
 * - Otherwise (claude `--fork-session`, ACP `session/fork`) → only the last
 *   message: those backends fork the whole session at HEAD, and a mid-history
 *   entry point would produce a fork whose backend context still contains
 *   everything after the visible cut.
 */
export function isForkEnabled(
  capability: TForkCapability | undefined,
  position: { isLastMessage: boolean; hasTurnAnchor: boolean }
): boolean {
  if (position.isLastMessage) return true;
  if (!capability) return false;
  return capability.at_turn && position.hasTurnAnchor;
}
