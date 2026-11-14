import type { Field, PointField } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

import {
  createAddressBeforeChangeHook,
  createMetaBeforeChangeHook,
  createPointBeforeChangeHook,
  fieldNames,
} from '../hooks/geocodeBeforeChange.js'

/**
 * Creates a row field containing:
 * 1. The provided point field, holding `[longitude, latitude]`
 * 2. A `{name}_meta` JSON field with the place's name, address and Google Place ID, picked in the
 *    admin panel through an address autocomplete
 * 3. A `{name}_address` text field, hidden in the admin panel: an address written here through the
 *    Local API, REST, GraphQL or an MCP tool is geocoded on save into the point and meta fields,
 *    and never stored
 *
 * With the `address` option, the point also fills itself from address fields the document already
 * has.
 */
export const geocodingField = (config: GeoCodingFieldConfig): Field => {
  const names = fieldNames(config.pointField.name)

  const metaField: Field = {
    name: names.meta,
    type: 'json',
    access: config.locationMetaOverride?.access ?? {},
    admin: {
      // overridable props:
      readOnly: true,

      ...config.locationMetaOverride?.admin,

      // non-overridable props:
      components: {
        Field: '@jhb.software/payload-geocoding-plugin/server#GeocodingField',
      },
    },
    hooks: {
      beforeChange: [createMetaBeforeChangeHook(config)],
    },
    jsonSchema: {
      fileMatch: ['a://b/foo.json'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          formattedAddress: { type: 'string' },
          googlePlaceId: { type: 'string' },
          partialMatch: { type: 'boolean' },
          precision: { type: 'string', enum: ['exact', 'interpolated', 'center', 'approximate'] },
          query: { type: 'string' },
          types: { type: 'array', items: { type: 'string' } },
        },
        required: ['formattedAddress', 'googlePlaceId', 'name', 'types'],
      },
      uri: 'a://b/foo.json',
    },
    label: config.locationMetaOverride?.label ?? 'Location',
    // The meta describes the point, so it varies by locale exactly when the point does.
    localized: config.pointField.localized,
    required: config.locationMetaOverride?.required,
  }

  const pointField: PointField = {
    ...config.pointField,
    hooks: {
      ...config.pointField.hooks,
      beforeChange: [
        ...(config.pointField.hooks?.beforeChange ?? []),
        createPointBeforeChangeHook(config),
      ],
    },
    // With `address`, the hook enforces `required` once it had the chance to fill the point.
    required: config.address ? false : config.pointField.required,
  }

  const addressField: Field = {
    name: names.address,
    type: 'text',
    // Writing an address sets the point, so it is allowed exactly when setting the point is.
    access: config.pointField.access,
    admin: {
      description: `Write an address here to set ${names.point} on save (geocoded, then cleared). Fails the save with the reason when the address cannot be geocoded.`,
      hidden: true,
    },
    hooks: {
      beforeChange: [createAddressBeforeChangeHook(config)],
    },
    label: 'Address to geocode',
    localized: config.pointField.localized,
  }

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [metaField, pointField, addressField],
  }
}
