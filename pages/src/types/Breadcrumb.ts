/** Field of a page which contain all information about a breadcrumb. */
export type Breadcrumb = {
  label: string
  /**
   * `null` for an ancestor which is not live in the breadcrumb's locale on a published read, so
   * the trail never links to a URL which does not resolve. Draft reads keep every path.
   */
  path: null | string
  slug: string
}
