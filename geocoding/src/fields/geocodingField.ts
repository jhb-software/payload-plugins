import type { Field, PointField, PointFieldValidation } from 'payload'

import { validations } from 'payload'

import type { GeoCodingFieldConfig } from '../types/GeoCodingFieldConfig.js'

import {
  createMetaBeforeChangeHook,
  createPointBeforeChangeHook,
  errorKey,
  fieldNames,
  resolutionKey,
} from '../hooks/geocodeBeforeChange.js'

/**
 * Wraps the point field's validation so a failed geocoding reports its reason (no match, too
 * imprecise, key refused) instead of a bare "required".
 */
function withGeocodingError(pointField: PointField): PointFieldValidation {
  const validate: PointFieldValidation = pointField.validate ?? validations.point
  return (value, options) => {
    const error = options.req?.context?.[errorKey(resolutionKey(options.id, options.path ?? []))]
    if (typeof error === 'string' && (value === null || value === undefined)) {
      return error
    }
    return validate(value, options)
  }
}

/**
 * Creates a row field containing:
 * 1. The provided point field, holding `[longitude, latitude]`
 * 2. A `{name}_meta` JSON field with the place's name, address and Google Place ID, picked in the
 *    admin panel through an address autocomplete
 * 3. A hidden virtual `{name}_address` text field: an address sent here through the Local API,
 *    REST or GraphQL is geocoded server-side into the point and meta fields
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
    validate: withGeocodingError(config.pointField),
  }

  const addressField: Field = {
    name: names.address,
    type: 'text',
    admin: {
      hidden: true,
    },
    label: 'Address (geocoded into the point on save)',
    virtual: true,
  }

  return {
    type: 'row',
    admin: {
      position: config.pointField.admin?.position ?? undefined,
    },
    fields: [metaField, pointField, addressField],
  }
}
