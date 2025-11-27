/** The SEO Metadata fields that are created by the plugin. */
export interface SeoMetadata {
  [key: string]: any
  alternatePaths: {
    hreflang: string
    id?: null | string
    path: string
  }[]
}
