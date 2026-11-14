import { useEffect, useRef } from 'react'

/**
 * A hook similar to useEffect but skips the first execution on the initial mount.
 */
export function useDidUpdateEffect(fn: () => void, inputs: unknown[]) {
  const isMountingRef = useRef(false)

  useEffect(() => {
    isMountingRef.current = true
  }, [])

  useEffect(() => {
    if (!isMountingRef.current) {
      return fn()
    } else {
      isMountingRef.current = false
    }
  }, inputs)
}
