import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Dialog({
  children,
  description,
  labelledBy,
  onClose,
  open,
  title,
  variant = 'dialog',
}: {
  readonly children: ReactNode
  readonly description?: string
  readonly labelledBy?: string
  readonly onClose: () => void
  readonly open: boolean
  readonly title: string
  readonly variant?: 'dialog' | 'drawer' | 'panel'
}) {
  const generatedTitleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(firstFocusable ?? dialogRef.current)?.focus()
    })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') {
      return
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    )

    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }

    const first = focusable[0]
    const last = focusable.at(-1)

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const titleId = labelledBy ?? generatedTitleId

  return (
    <div
      className="dialog-backdrop"
      data-variant={variant}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose()
        }
      }}
    >
      <div
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog-surface dialog-surface--${variant}`}
        onKeyDown={keepFocusInside}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <div>
            <p className="overline">Product preview</p>
            <h2 id={titleId}>{title}</h2>
            {description === undefined ? null : <p id={descriptionId}>{description}</p>}
          </div>
          <button
            aria-label={`Close ${title.toLowerCase()}`}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
