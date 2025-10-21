import type OpenAI from 'openai'
import { AltTextPluginConfig } from '../types/AltTextPluginConfig'

type GenerationCost = {
  model: 'gpt-4.1-nano' | 'gpt-4.1-mini'
  inputCost: number
  outputCost: number
  totalCost: number
  totalTokens: number
}

/** Calculates the cost of a generation. */
export function getGenerationCost(
  response: OpenAI.Chat.Completions.ChatCompletion,
  model: AltTextPluginConfig['model'],
): GenerationCost {
  const modelCosts: Record<AltTextPluginConfig['model'], { input: number; output: number }> = {
    // see https://platform.openai.com/docs/models/gpt-4.1-nano
    'gpt-4.1-nano': {
      input: 0.1,
      output: 0.4,
    },
    // see https://platform.openai.com/docs/models/gpt-4.1-mini
    'gpt-4.1-mini': {
      input: 0.4,
      output: 1.6,
    },
  }

  // Calculate cost based on token usage
  const inputTokens = response.usage?.prompt_tokens || 0
  const outputTokens = response.usage?.completion_tokens || 0
  const totalTokens = response.usage?.total_tokens || 0

  const inputCost = (inputTokens / 1_000_000) * modelCosts[model].input
  const outputCost = (outputTokens / 1_000_000) * modelCosts[model].output
  const totalCost = inputCost + outputCost

  return {
    model,
    inputCost,
    outputCost,
    totalCost,
    totalTokens,
  }
}
