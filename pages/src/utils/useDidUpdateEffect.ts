import { useRef } from 'react'

import { useEffect } from 'react'

/**
 * A hook similar to useEffect but skips the first execution on the initial mount.
 */
export function useDidUpdateEffect(fn: () => void, inputs: any[]) {
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
