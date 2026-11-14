import './styles.scss'

import { getTranslation } from '@payloadcms/translations'
import { Button, LoadingOverlay, Modal, Popup, PopupList, useTranslation } from '@payloadcms/ui'
import { useState } from 'react'

import { useTranslator } from '../../providers/Translator/context.js'
import { LocaleLabel } from '../LocaleLabel/LocaleLabel.js'

export const TranslatorModal = () => {
  const {
    localesOptions,
    localeToTranslateFrom: localeCodeToTranslateFrom,
    setLocaleToTranslateFrom,
    submit,
    translatorT,
  } = useTranslator()
  const { closeTranslator, modalSlug, resolver } = useTranslator()

  const { i18n } = useTranslation()

  const localeToTranslateFrom = localesOptions.find(
    (each) => each.code === localeCodeToTranslateFrom,
  )

  const [isTranslating, setIsTranslating] = useState(false)

  async function onSubmit(emptyOnly: boolean) {
    setIsTranslating(true)
    await submit({ emptyOnly })
    setIsTranslating(false)
  }

  return !resolver ? (
    <></>
  ) : isTranslating ? (
    <>
      <LoadingOverlay loadingText={translatorT('modalTranslating')} />
    </>
  ) : (
    <Modal className={'translator__modal'} slug={modalSlug}>
      <div className={'translator__wrapper'}>
        <button
          aria-label="Close"
          className={'translator__close'}
          onClick={closeTranslator}
          type="button"
        >
          <svg
            className="close-icon"
            data-testid="geist-icon"
            height="16"
            strokeLinejoin="round"
            style={{ color: 'currentcolor' }}
            viewBox="0 0 16 16"
            width="16"
          >
            <path
              clipRule="evenodd"
              d="M12.47 13.53l.53.53L14.06 13l-.53-.53L9.06 8l4.47-4.47.53-.53L13 1.94l-.53.53L8 6.94 3.53 2.47 3 1.94 1.94 3l.53.53L6.94 8l-4.47 4.47-.53.53L3 14.06l.53-.53L8 9.06l4.47 4.47z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </button>

        <div className={'translator__content'}>
          <h2>{translatorT('modalTitle')}</h2>
          {localeToTranslateFrom && (
            <Popup
              button={<LocaleLabel locale={localeToTranslateFrom} />}
              horizontalAlign="center"
              render={({ close }) => (
                <PopupList.ButtonGroup>
                  {localesOptions.map((option) => {
                    const label = getTranslation(option.label, i18n)

                    return (
                      <PopupList.Button
                        active={option.code === localeCodeToTranslateFrom}
                        key={option.code}
                        onClick={() => {
                          setLocaleToTranslateFrom(option.code)
                          close()
                        }}
                      >
                        {label}
                        {label !== option.code && ` (${option.code})`}
                      </PopupList.Button>
                    )
                  })}
                </PopupList.ButtonGroup>
              )}
              verticalAlign="bottom"
            />
          )}

          <p>{translatorT('modalDescription')}</p>

          <div className={'translator__buttons'}>
            <div className={'translator__buttons'}>
              {isTranslating ? (
                <>
                  <LoadingOverlay loadingText={translatorT('modalTranslating')} />
                </>
              ) : (
                <>
                  <Button onClick={() => onSubmit(false)}>
                    {translatorT('submitButtonLabelFull')}
                  </Button>
                  <Button buttonStyle="pill" onClick={() => onSubmit(true)}>
                    {translatorT('submitButtonLabelEmpty')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
