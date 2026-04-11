'use client'

/**
 * Client-side exports for the chat agent plugin.
 * This is the entry point for `@jhb.software/payload-chat-agent/client`.
 */

export { default as ChatView } from '../ui/ChatView.js'
export { ModeSelector } from '../ui/ModeSelector.js'
export { ToolConfirmation } from '../ui/ToolConfirmation.js'
export { type ChatMessageUI, useChat, type UseChatOptions } from '../ui/use-chat.js'
export { type TokenBudgetInfo, useTokenBudget } from '../ui/useTokenBudget.js'
