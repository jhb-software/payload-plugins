import type { CheckboxFieldServerComponent, Where } from 'payload'

import { IsRootPageStatus } from '../client/IsRootPageStatus.js'

/**
 * Field which fetches the root page and forwards the result to the `IsRootPageStatus` client component.
 */
export const IsRootPageField: CheckboxFieldServerComponent = async ({
  clientField,
  collectionSlug,
  field,
  path,
  payload,
  permissions,
  readOnly,
  req,
  // @ts-expect-error: TODO: extend the CheckboxFieldServerComponent type to allow passing the baseFilter
  baseFilter,
}) => {
  const baseFilterWhere: undefined | Where =
    typeof baseFilter === 'function' ? baseFilter({ req }) : undefined

  const response = await payload.count({
    collection: collectionSlug,
    where: {
      and: [{ isRootPage: { equals: true } }, { ...baseFilterWhere }],
    },
  })

  const hasRootPage = response.totalDocs > 0

  // Determine if field should be readonly based on permissions
  const isReadOnly = readOnly || (permissions !== true && permissions?.update !== true)

  return (
    <IsRootPageStatus
      field={clientField}
      hasRootPage={hasRootPage}
      path={(path as string | undefined) ?? field?.name}
      readOnly={isReadOnly}
    />
  )
}
