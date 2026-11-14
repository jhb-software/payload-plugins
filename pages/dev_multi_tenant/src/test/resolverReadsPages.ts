/**
 * Test-only request header which makes the `localeRouting` resolver read the `pages` collection
 * with the incoming request, so the plugin's handling of a resolver that re-enters a page
 * collection can be exercised end to end.
 */
export const RESOLVER_READS_PAGES_HEADER = 'x-test-resolver-reads-pages'
