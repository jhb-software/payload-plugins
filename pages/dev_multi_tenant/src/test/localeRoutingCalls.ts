/** Counts how often the plugin evaluated the `localeRouting` resolver, per test. */
let calls = 0

export const recordLocaleRoutingCall = () => {
  calls++
}

export const localeRoutingCalls = () => calls

export const clearLocaleRoutingCalls = () => {
  calls = 0
}
