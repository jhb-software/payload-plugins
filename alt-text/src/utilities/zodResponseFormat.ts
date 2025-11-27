import type { AutoParseableResponseFormat } from 'openai/lib/parser.mjs'
import type { ResponseFormatJSONSchema } from 'openai/resources/shared.mjs'

import { makeParseableResponseFormat } from 'openai/lib/parser.mjs'
import { z } from 'zod'

/**
 * Creates a chat completion `JSONSchema` response format object from
 * the given Zod schema.
 *
 * This is a temporary drop in replacement for the zodResponseFormat from openai/helpers/zod.ts
 * because of issue https://github.com/openai/openai-node/issues/1576
 */
export function zodResponseFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
  name: string,
  props?: Omit<ResponseFormatJSONSchema.JSONSchema, 'name' | 'schema' | 'strict'>,
): AutoParseableResponseFormat<z.infer<ZodInput>> {
  return makeParseableResponseFormat(
    {
      type: 'json_schema',
      json_schema: {
        ...props,
        name,
        schema: z.toJSONSchema(zodObject, { target: 'draft-7' }),
        strict: true,
      },
    },
    (content) => zodObject.parse(JSON.parse(content)),
  )
}
