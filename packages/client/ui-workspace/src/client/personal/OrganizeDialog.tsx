/**
 * Tag window: create personal tags, attach them to one session, and pick a
 * tag to filter the session list.
 */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import {
  TAG_COLORS, createTag, deleteTag, toggleSessionTag, useOrganize,
} from './organize.ts'
import css from './OrganizeDialog.module.css'

type Translate = WorkspaceBrowserProps['t']

/**
 * Personal tag window.
 * @param props.open - whether the modal is on screen.
 * @param props.sessionId - set when the window was opened from a session menu.
 * @param props.activeTagId - tag currently filtering the list.
 * @param props.onFilterTag - apply or clear a tag filter.
 * @param props.onClose - dismiss the window.
 * @param props.t - workspace locale seat.
 */
export function OrganizeDialog({
  open, sessionId, activeTagId, onFilterTag, onClose, t,
}: {
  open: boolean
  sessionId?: string | undefined
  activeTagId?: string | undefined
  onFilterTag: (tagId: string | undefined) => void
  onClose: () => void
  t: Translate
}) {
  const organize = useOrganize()
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLORS[0] ?? '#f59e0b')
  const attached = sessionId === undefined ? [] : (organize.sessionTags[sessionId] ?? [])

  const add = (): void => {
    const tag = createTag(name, color)
    if (tag !== undefined && sessionId !== undefined && !attached.includes(tag.id)) {
      toggleSessionTag(sessionId, tag.id)
    }
    setName('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      title={sessionId === undefined ? t('tags.title') : t('tags.sessionTitle')}
      footer={<Button variant="primary" onClick={onClose}>{t('tags.apply')}</Button>}
    >
      <div className={css.createRow}>
        <input
          className={css.nameInput}
          value={name}
          aria-label={t('tags.name')}
          placeholder={t('tags.name')}
          maxLength={40}
          onChange={(event) => { setName(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <span className={css.swatches}>
          {TAG_COLORS.map(swatch => (
            <button
              key={swatch}
              type="button"
              className={swatch === color ? css.swatchOn : css.swatch}
              style={{ background: swatch }}
              aria-label={swatch}
              onClick={() => { setColor(swatch) }}
            />
          ))}
        </span>
        <Button variant="outline" disabled={name.trim() === ''} onClick={add}>{t('tags.create')}</Button>
      </div>
      {organize.tags.length === 0 && <div className={css.empty}>{t('tags.empty')}</div>}
      <ul className={css.list}>
        {organize.tags.map((tag) => {
          const checked = attached.includes(tag.id)
          const filtering = activeTagId === tag.id
          return (
            <li key={tag.id} className={css.item}>
              <span className={css.dot} style={{ background: tag.color }} />
              <span className={css.tagName}>{tag.name}</span>
              {sessionId !== undefined && (
                <button
                  type="button"
                  className={checked ? css.checkOn : css.check}
                  onClick={() => { toggleSessionTag(sessionId, tag.id) }}
                >
                  {checked ? t('tags.checked') : t('tags.check')}
                </button>
              )}
              <button
                type="button"
                className={filtering ? css.checkOn : css.check}
                onClick={() => { onFilterTag(filtering ? undefined : tag.id) }}
              >
                {filtering ? t('tags.filtering') : t('tags.filter')}
              </button>
              <button type="button" className={css.delete} onClick={() => { deleteTag(tag.id) }}>
                {t('tags.delete')}
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
