import { useEffect, useState, type RefObject } from 'react'
import { useStore } from './store/store'

export const useData = () => useStore((s) => s.data)

/** The phone layout's breakpoint; the styles in phone.css switch at the same width. */
export const PHONE = '(max-width: 760px)'

export function useIsPhone() {
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches)
  useEffect(() => {
    const mq = matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

export const useScrolled = (threshold = 24) => {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = document.getElementById('main')
    if (!el) return
    const on = () => setScrolled(el.scrollTop > threshold)
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

export const useClickOutside = (ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) => {
  useEffect(() => {
    if (!active) return
    const on = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside()
    document.addEventListener('pointerdown', on)
    return () => document.removeEventListener('pointerdown', on)
  }, [ref, onOutside, active])
}

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
