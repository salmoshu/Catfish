export const CHAT_SURFACE_CONTAINER_CLASS = 'chat-surface-container';

export const CHAT_SURFACE_WIDTH_CLASS = 'chat-surface-fluid';

/**
 * Shared width for message rows, the plan bar, queues and the Composer.
 *
 * The content is centered and capped at 800px. Narrow standalone columns and
 * team parallel columns still use all available width instead of shrinking
 * further, so layout follows the available column rather than the chat mode.
 */
export const getChatSurfaceWidthClass = (): string => CHAT_SURFACE_WIDTH_CLASS;
