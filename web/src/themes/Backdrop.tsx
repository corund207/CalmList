import { useEffect, useRef } from 'react'
import { rgba } from '../lib/color'
import type { Backdrop as Kind } from './themes'

type Colors = { fg: string; accent: string; accentBright: string; bg: string }
type Frame = (t: number) => void
type Scene = (ctx: CanvasRenderingContext2D, w: number, h: number, c: Colors) => Frame

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const TAU = Math.PI * 2

/* ─── Canvas scenes: each returns a frame function for its size ──────────── */

const stars: Scene = (ctx, w, h, c) => {
  const list = Array.from({ length: Math.round((w * h) / 5200) }, () => ({ x: rand(0, w), y: rand(0, h), z: rand(0.2, 1), p: rand(0, TAU) }))
  return (t) => {
    ctx.clearRect(0, 0, w, h)
    for (const s of list) {
      s.x -= s.z * 0.12
      s.y += s.z * 0.04
      if (s.x < 0) s.x += w
      if (s.y > h) s.y -= h
      ctx.fillStyle = rgba(s.z > 0.85 ? c.accentBright : c.fg, 0.25 + 0.55 * s.z * (0.6 + 0.4 * Math.sin(t / 700 + s.p)))
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.z * 1.4, 0, TAU)
      ctx.fill()
    }
  }
}

const rain: Scene = (ctx, w, h, c) => {
  const drops = Array.from({ length: Math.round(w / 9) }, () => ({ x: rand(0, w), y: rand(-h, h), l: rand(10, 26), v: rand(7, 14) }))
  return () => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = rgba(c.accentBright, 0.22)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const d of drops) {
      d.y += d.v
      d.x -= d.v * 0.18
      if (d.y > h) Object.assign(d, { y: rand(-60, 0), x: rand(0, w + 80) })
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x + d.l * 0.18, d.y - d.l)
    }
    ctx.stroke()
  }
}

const matrix: Scene = (ctx, w, h, c) => {
  const size = 16
  const cols = Array.from({ length: Math.ceil(w / size) }, () => rand(-h / size, 0))
  const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>+*='
  let last = 0
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, w, h)
  return (t) => {
    if (t - last < 55) return
    last = t
    ctx.fillStyle = rgba(c.bg, 0.12)
    ctx.fillRect(0, 0, w, h)
    ctx.font = `${size - 2}px ui-monospace, monospace`
    cols.forEach((y, i) => {
      ctx.fillStyle = rgba(c.accent, Math.random() > 0.97 ? 0.45 : 0.16)
      ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y * size)
      cols[i] = y * size > h && Math.random() > 0.975 ? 0 : y + 1
    })
  }
}

const fireflies: Scene = (ctx, w, h, c) => {
  const flies = Array.from({ length: Math.round((w * h) / 30000) + 12 }, () => ({ x: rand(0, w), y: rand(0, h), a: rand(0, TAU), p: rand(0, TAU), s: rand(0.2, 0.6) }))
  return (t) => {
    ctx.clearRect(0, 0, w, h)
    for (const f of flies) {
      f.a += rand(-0.08, 0.08)
      f.x = (f.x + Math.cos(f.a) * f.s + w) % w
      f.y = (f.y + Math.sin(f.a) * f.s + h) % h
      const glow = Math.max(0, Math.sin(t / 900 + f.p)) ** 2
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14)
      g.addColorStop(0, rgba(c.accent, 0.8 * glow))
      g.addColorStop(1, rgba(c.accent, 0))
      ctx.fillStyle = g
      ctx.fillRect(f.x - 14, f.y - 14, 28, 28)
    }
  }
}

const snow: Scene = (ctx, w, h, c) => {
  const flakes = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 2.6), v: rand(0.3, 1.1), p: rand(0, TAU) }))
  return (t) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = rgba(c.fg, 0.55)
    ctx.beginPath()
    for (const f of flakes) {
      f.y += f.v
      f.x += Math.sin(t / 1400 + f.p) * 0.35
      if (f.y > h + 4) Object.assign(f, { y: -4, x: rand(0, w) })
      ctx.moveTo(f.x + f.r, f.y)
      ctx.arc(f.x, f.y, f.r, 0, TAU)
    }
    ctx.fill()
  }
}

const sakura: Scene = (ctx, w, h) => {
  const petals = Array.from({ length: Math.round(w / 38) }, () => ({ x: rand(0, w), y: rand(-h, h), r: rand(0, TAU), vr: rand(-0.02, 0.02), s: rand(5, 9), v: rand(0.5, 1.2), p: rand(0, TAU) }))
  return (t) => {
    ctx.clearRect(0, 0, w, h)
    for (const q of petals) {
      q.y += q.v
      q.x += Math.sin(t / 1600 + q.p) * 0.6 + 0.25
      q.r += q.vr
      if (q.y > h + 10) Object.assign(q, { y: -10, x: rand(-40, w) })
      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.rotate(q.r)
      ctx.scale(1, Math.abs(Math.sin(t / 900 + q.p)) * 0.5 + 0.5)
      ctx.fillStyle = 'rgba(244, 164, 190, 0.55)'
      ctx.beginPath()
      ctx.ellipse(0, 0, q.s, q.s * 0.62, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }
}

const SCENES: Partial<Record<Kind, Scene>> = { stars, rain, matrix, fireflies, snow, sakura }

function CanvasScene({ scene, still }: { scene: Scene; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const color = (v: string) => css.getPropertyValue(v).trim()
    const colors = { fg: color('--foreground'), accent: color('--accent'), accentBright: color('--accent-bright'), bg: color('--background') }
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    let frame: Frame = () => {}
    let raf = 0
    const size = () => {
      canvas.width = innerWidth * dpr
      canvas.height = innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      frame = scene(ctx, innerWidth, innerHeight, colors)
      if (still) for (let i = 0; i < 90; i++) frame(i * 16)
    }
    const loop = (t: number) => {
      frame(t)
      raf = requestAnimationFrame(loop)
    }
    const visibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !still) raf = requestAnimationFrame(loop)
    }
    size()
    visibility()
    addEventListener('resize', size)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [scene, still])
  return <canvas ref={ref} className="backdrop-canvas" />
}

/** The living layer behind (or, for scanlines, over) the app. Honours reduced motion and the motion toggle. */
export function Backdrop({ kind, motion, themeId }: { kind?: Kind; motion: boolean; themeId: string }) {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!kind) return null
  const still = reduced || !motion
  const scene = SCENES[kind]
  return (
    <div className="backdrop-layer" data-kind={kind} data-still={still || undefined} aria-hidden="true" key={themeId}>
      {scene ? (
        <CanvasScene scene={scene} still={still} />
      ) : (
        <>
          <span className="bd bd-1" />
          <span className="bd bd-2" />
          <span className="bd bd-3" />
          <span className="bd bd-4" />
        </>
      )}
    </div>
  )
}
