import React from 'react'
import DropdownList from './DropdownList'

function getOptionsFromChildren(children) {
  if (!children) return []
  return React.Children.toArray(children)
    .filter((child) => React.isValidElement(child) && child.type === 'option')
    .map((child) => ({
      value: child.props.value,
      label: child.props.children,
      disabled: child.props.disabled,
    }))
}

export default function StyledSelect({
  value,
  onChange,
  placeholder,
  children,
  className = '',
  style = {},
  name,
  disabled,
  id,
  options,
  ...rest
}) {
  const resolvedOptions = Array.isArray(options) && options.length > 0 ? options : getOptionsFromChildren(children)

  const handleChange = (nextValue) => {
    if (!onChange) return
    onChange({ target: { value: nextValue, name, id } })
  }

  return (
    <DropdownList
      id={id}
      name={name}
      value={value}
      onChange={handleChange}
      options={resolvedOptions}
      placeholder={placeholder}
      disabled={disabled}
      className={`styled-select ${className}`.trim()}
      style={style}
      {...rest}
    />
  )
}
