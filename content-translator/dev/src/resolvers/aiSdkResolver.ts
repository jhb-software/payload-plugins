import type { LanguageModel } from 'ai'

import type {
  TranslateInstructions,
  TranslateResolver,
} from '@jhb.software/payload-content-translator-plugin'

import { createPromptResolver } from '@jhb.software/payload-content-translator-plugin'
import { generateText, Output } from 'ai'
import { z } from 'zod'

/**
 * A translation resolver built on the Vercel AI SDK, usable with any provider
 * the SDK supports. Copy this file into your project as is — everything is
 * configurable from your Payload config.
 *
 * Requires `ai` and `zod`, plus a provider package such as `@ai-sdk/openai`
 * (or a `provider/model` string routed through the AI Gateway).
 */

export type AiSdkResolverConfig = {
  /**
   * How many texts to include into 1 request
   * @default 100
   */
  chunkLength?: number
  /**
   * The language model to translate with, e.g. `openai('gpt-4o-mini')` or a
   * `'openai/gpt-4o-mini'` string routed through the AI Gateway.
   */
  model: LanguageModel
  /**
   * Builds the instructions from the default ones, e.g. to append protected
   * terms. Sent as the system prompt, separately from the texts.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: TranslateInstructions
}

/** Index-keyed translations, mirroring the shape of the input object. */
const translationsSchema = z.object({
  translations: z.record(z.string(), z.string()),
})

export const aiSdkResolver = ({
  chunkLength,
  instructions: instructionsOption,
  model,
}: AiSdkResolverConfig): TranslateResolver =>
  createPromptResolver({
    chunkLength,
    generate: async ({ input, instructions }) => {
      const { output } = await generateText({
        instructions,
        model,
        // Structured output guarantees the response shape, so no
        // responseFormatInstruction is needed.
        output: Output.object({ schema: translationsSchema }),
        prompt: input,
      })

      return output.translations
    },
    instructions: instructionsOption,
    key: 'ai-sdk',
  })
