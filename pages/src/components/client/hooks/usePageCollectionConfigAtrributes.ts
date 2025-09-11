import { asPageCollectionConfigOrThrow } from '../../../utils/clientUtils.js'
import { PageCollectionConfigAttributes } from '../../../types/PageCollectionConfigAttributes.js'
import { useCollectionConfig } from './useCollectionConfig.js'

export function usePageCollectionConfigAttributes(): PageCollectionConfigAttributes {
  const collection = useCollectionConfig()

  return asPageCollectionConfigOrThrow(collection).page
}
