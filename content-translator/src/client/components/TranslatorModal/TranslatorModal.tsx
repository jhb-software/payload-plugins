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
            fill="none"
            height="24"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" />
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
