import type { CustomPublishButton } from 'payload'

export const CustomButton = (type: 'publish' | 'save'): CustomPublishButton => {
  return {
    clientProps: {
      type,
    },
    path: '@jhb.software/payload-content-translator/client#CustomButtonWithTranslator',
  }
}
