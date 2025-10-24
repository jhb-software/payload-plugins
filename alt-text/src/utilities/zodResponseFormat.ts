import { AutoParseableResponseFormat, makeParseableResponseFormat } from 'openai/lib/parser.mjs'
import { ResponseFormatJSONSchema } from 'openai/resources/shared.mjs'
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
  props?: Omit<ResponseFormatJSONSchema.JSONSchema, 'schema' | 'strict' | 'name'>,
): AutoParseableResponseFormat<z.infer<ZodInput>> {
  return makeParseableResponseFormat(
    {
      type: 'json_schema',
      json_schema: {
        ...props,
        name,
        strict: true,
        schema: z.toJSONSchema(zodObject, { target: 'draft-7' }),
      },
    },
    (content) => zodObject.parse(JSON.parse(content)),
  )
}
