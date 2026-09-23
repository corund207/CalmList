// Scroll reveals, media scrub and an ambient dot field. Everything stops under reduced motion.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const header = document.getElementById('header')
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 24)
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  if (reduce) return

  // Heading groups fade up once, at 92% of the viewport.
  const groups = document.querySelectorAll('.reveal')
  groups.forEach((g) => g.classList.add('is-pending'))
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.replace('is-pending', 'is-in')
      io.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -8% 0px' })
  groups.forEach((g) => io.observe(g))

  // Immersive media scales .96 → 1 as it rises from 95% to the 66% line.
  const frames = [...document.querySelectorAll('.scrub')]
  let ticking = false
  const scrub = () => {
    ticking = false
    for (const f of frames) {
      const r = f.getBoundingClientRect()
      const start = innerHeight * 0.95
      const end = innerHeight * 0.66 - r.height / 2
      const t = Math.min(1, Math.max(0, (start - r.top) / (start - end)))
      f.style.setProperty('--scrub-scale', (0.96 + 0.04 * t).toFixed(4))
      f.style.setProperty('--scrub-opacity', (0.74 + 0.26 * t).toFixed(3))
    }
  }
  addEventListener('scroll', () => ticking || (ticking = requestAnimationFrame(scrub)), { passive: true })
  scrub()

  // DotField: a quiet lattice that leans toward the cursor and settles back.
  const canvas = document.querySelector('.dots')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const host = canvas.parentElement
  const dpr = Math.min(devicePixelRatio || 1, 1.5)
  const pointer = { x: -1e4, y: -1e4 }
  let dots = []
  let running = false
  let inView = false
  const layout = () => {
    const { width, height } = host.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    dots = []
    for (let y = 23; y < height; y += 46) for (let x = 23; x < width; x += 46) dots.push({ x, y, ox: 0, oy: 0, phase: Math.random() * 6.28 })
  }
  const frame = (time) => {
    if (!running) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(245, 245, 247, 0.26)'
    for (const d of dots) {
      const dx = pointer.x - d.x
      const dy = pointer.y - d.y
      const dist = Math.hypot(dx, dy)
      const pull = dist < 320 ? (1 - dist / 320) * 14 : 0
      const tx = (dist ? (dx / dist) * pull : 0) + Math.sin(time / 1000 * 0.2 + d.phase) * 4
      const ty = (dist ? (dy / dist) * pull : 0) + Math.cos(time / 1000 * 0.2 + d.phase) * 4
      d.ox += (tx - d.ox) * 0.045
      d.oy += (ty - d.oy) * 0.045
      ctx.beginPath()
      ctx.arc(d.x + d.ox, d.y + d.oy, 1.3, 0, 6.283)
      ctx.fill()
    }
    requestAnimationFrame(frame)
  }
  const setRunning = (on) => {
    if (on === running) return
    running = on
    if (on) requestAnimationFrame(frame)
  }
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect()
    pointer.x = e.clientX - r.left
    pointer.y = e.clientY - r.top
  })
  host.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4 })
  new IntersectionObserver(([e]) => setRunning((inView = e.isIntersecting) && !document.hidden)).observe(host)
  document.addEventListener('visibilitychange', () => setRunning(inView && !document.hidden))
  addEventListener('resize', layout)
  layout()
})()
