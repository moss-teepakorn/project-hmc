import { useEffect } from 'react'
import TomSelect from 'tom-select'

const SELECTOR = 'select:not([multiple]):not([data-native-select="true"])'

export default function GlobalSearchableDropdowns() {
  useEffect(() => {
    const instances = new Map()

    const shouldEnhance = (node) => {
      if (!(node instanceof HTMLSelectElement)) return false
      if (node.multiple) return false
      if (node.disabled) return false
      if (node.closest('.ts-wrapper')) return false
      if (node.getAttribute('data-native-select') === 'true') return false
      return true
    }

    const initSelect = (select) => {
      if (!shouldEnhance(select)) return
      if (instances.has(select)) return
      if (select.tomselect) return

      try {
        const instance = new TomSelect(select, {
          create: false,
          maxOptions: 1000,
          hideSelected: false,
          allowEmptyOption: true,
          closeAfterSelect: true,
          searchField: ['text'],
          sortField: [{ field: '$order' }],
          dropdownParent: 'body',
          placeholder: select.getAttribute('placeholder') || 'ค้นหา',
          render: {
            no_results(data, escape) {
              return `<div class="no-results">ไม่พบข้อมูล: ${escape(data.input)}</div>`
            },
            no_more_results() {
              return '<div class="no-more-results"></div>'
            },
          },
        })
        instances.set(select, instance)
      } catch (error) {
        console.warn('Searchable dropdown init failed:', error)
      }
    }

    const destroySelect = (select) => {
      const instance = instances.get(select)
      if (!instance) return
      try {
        instance.destroy()
      } catch {
        // no-op
      }
      instances.delete(select)
    }

    const enhanceAll = () => {
      const selects = Array.from(document.querySelectorAll(SELECTOR))
      for (const select of selects) {
        initSelect(select)
      }
    }

    const cleanDetached = () => {
      for (const [select, instance] of Array.from(instances.entries())) {
        if (!document.contains(select)) {
          try {
            instance.destroy()
          } catch {
            // no-op
          }
          instances.delete(select)
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLSelectElement) {
            initSelect(node)
          } else if (node instanceof HTMLElement) {
            const nested = node.querySelectorAll?.(SELECTOR) || []
            for (const select of nested) {
              initSelect(select)
            }
          }
        }

        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLSelectElement) {
            destroySelect(node)
          } else if (node instanceof HTMLElement) {
            const nested = node.querySelectorAll?.('select') || []
            for (const select of nested) {
              destroySelect(select)
            }
          }
        }
      }

      cleanDetached()
    })

    try {
      enhanceAll()
    } catch (error) {
      console.warn('Searchable dropdown bootstrap failed:', error)
    }
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      for (const [, instance] of instances) {
        try {
          instance.destroy()
        } catch {
          // no-op
        }
      }
      instances.clear()
    }
  }, [])

  return null
}
