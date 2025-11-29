import type { CustomPublishButton, CustomSaveButton } from 'payload'

export const CustomButton = (type: 'publish' | 'save'): CustomPublishButton | CustomSaveButton => {
  return {
    clientProps: {
      type,
    },
    path: '@jhb.software/payload-content-translator/client#CustomButtonWithTranslator',
  }
}
