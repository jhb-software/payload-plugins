import type { Block } from 'payload'

/** A block-level CTA — rendered by the dev app's CustomBlock component. */
export const CtaBlock: Block = {
  slug: 'cta',
  interfaceName: 'CtaBlock',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
  ],
}

/** An inline badge — rendered by CustomBlock with `inline={true}`. */
export const BadgeBlock: Block = {
  slug: 'badge',
  interfaceName: 'BadgeBlock',
  fields: [{ name: 'label', type: 'text', required: true }],
}
