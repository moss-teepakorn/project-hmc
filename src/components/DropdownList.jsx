import { useEffect, useMemo, useRef, useState } from 'react'

export default function DropdownList({
  value,
  options,
  onChange,
  placeholder,
  compact = false,
  className = '',
  disabled = false,
  id,
  name,
  style = {},
  ...rest
}) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  const optionsList = useMemo(() => {
    if (!Array.isArray(options)) return []
    return options.map((option) => {
      if (option && typeof option === 'object') return option
      return { value: option, label: String(option) }
    })
  }, [options])

  const selected = useMemo(
    () => optionsList.find((option) => String(option.value) === String(value)) || null,
    [optionsList, value]
  )

  useEffect(() => {
    if (!open) setKeyword('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const filtered = useMemo(() => {
    const needle = String(keyword || '').trim().toLowerCase()
    if (!needle) return optionsList
    return optionsList.filter((option) => String(option.label || '').toLowerCase().includes(needle))
  }, [optionsList, keyword])

  return (
    <div
      ref={rootRef}
      id={id}
      data-name={name}
      className={`cars-ss ${compact ? 'cars-ss--compact' : ''} ${open ? 'is-open' : ''} ${className}`.trim()}
      style={style}
      {...rest}
    >
      <input
        name={name}
        className="cars-ss-input"
        value={disabled ? selected?.label || '' : open ? keyword : selected?.label || ''}
        onChange={(event) => {
          if (disabled) return
          setKeyword(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (disabled) return
          setKeyword('')
          setOpen(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={disabled}
      />
      {open && !disabled && (
        <div className="cars-ss-menu">
          {filtered.length === 0 ? (
            <div className="cars-ss-empty">ไม่พบข้อมูล</div>
          ) : (
            filtered.map((option) => {
              const isSelected = String(value) === String(option.value)
              return (
                <button
                  key={`${option.value}`}
                  type="button"
                  className={`cars-ss-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (option.disabled) return
                    onChange(option.value)
                    setKeyword(option.label)
                    setOpen(false)
                  }}
                  disabled={option.disabled}
                >
                  <span>{option.label}</span>
                  <span className="cars-ss-item-arrow">›</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
