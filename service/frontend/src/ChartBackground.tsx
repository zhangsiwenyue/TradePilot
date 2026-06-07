import { useEffect, useRef } from 'react'

import { useTheme } from './appShared'

/**
 * Animated stock-chart background.
 *
 * - Multiple price series (line + soft area fill) drift left continuously.
 * - A vertical/horizontal grid scrolls with the chart for parallax.
 * - Adapts to dark / light theme and resizes with the window.
 * - Honors prefers-reduced-motion (renders a static frame).
 */
export function ChartBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isLight = theme === 'light'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Palette ---------------------------------------------------------------
    type SeriesStyle = {
      stroke: string
      glow: string
      fillTop: string
      fillBottom: string
      width: number
    }
    const seriesStyles: SeriesStyle[] = isLight
      ? [
          { stroke: 'rgba(8, 145, 178, 0.70)',  glow: 'rgba(8, 145, 178, 0.55)',  fillTop: 'rgba(8, 145, 178, 0.18)',  fillBottom: 'rgba(8, 145, 178, 0)',  width: 1.8 },
          { stroke: 'rgba(124, 58, 237, 0.55)', glow: 'rgba(124, 58, 237, 0.40)', fillTop: 'rgba(124, 58, 237, 0.12)', fillBottom: 'rgba(124, 58, 237, 0)', width: 1.5 },
          { stroke: 'rgba(236, 72, 153, 0.45)', glow: 'rgba(236, 72, 153, 0.32)', fillTop: 'rgba(236, 72, 153, 0.08)', fillBottom: 'rgba(236, 72, 153, 0)', width: 1.3 },
        ]
      : [
          { stroke: 'rgba(34, 211, 238, 0.85)',  glow: 'rgba(34, 211, 238, 0.55)',  fillTop: 'rgba(34, 211, 238, 0.18)',  fillBottom: 'rgba(34, 211, 238, 0)',  width: 1.8 },
          { stroke: 'rgba(139, 92, 246, 0.70)',  glow: 'rgba(139, 92, 246, 0.40)',  fillTop: 'rgba(139, 92, 246, 0.14)',  fillBottom: 'rgba(139, 92, 246, 0)',  width: 1.5 },
          { stroke: 'rgba(236, 72, 153, 0.55)',  glow: 'rgba(236, 72, 153, 0.30)',  fillTop: 'rgba(236, 72, 153, 0.08)',  fillBottom: 'rgba(236, 72, 153, 0)',  width: 1.3 },
        ]
    const gridColor = isLight ? 'rgba(56, 84, 130, 0.12)' : 'rgba(34, 211, 238, 0.10)'
    const gridFaint = isLight ? 'rgba(56, 84, 130, 0.05)' : 'rgba(34, 211, 238, 0.04)'

    // Geometry --------------------------------------------------------------
    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    const STEP = 14            // horizontal pixel spacing between samples
    const GRID_SIZE = 80       // grid cell size (px)
    const FILL_OPACITY = 1

    // Per-series state ------------------------------------------------------
    type Series = {
      values: number[]          // y-values, length = samples + buffer
      offset: number            // horizontal drift in [0, STEP)
      speed: number             // px/sec scroll speed (rightmost edge advances left)
      drift: number             // long-term slope bias (-1..1)
      volatility: number        // per-sample random walk strength
      style: SeriesStyle
      verticalRange: [number, number] // normalized [top, bottom] band within canvas
    }
    const series: Series[] = []

    const seedSeries = () => {
      series.length = 0
      const samples = Math.ceil(width / STEP) + 6
      seriesStyles.forEach((style, i) => {
        const drift = (Math.random() - 0.5) * 0.4
        const volatility = 0.10 + Math.random() * 0.10
        const values: number[] = []
        let v = 0.5 + (Math.random() - 0.5) * 0.2
        for (let k = 0; k < samples; k += 1) {
          v += drift * 0.012 + (Math.random() - 0.5) * volatility * 0.18
          v = Math.max(0.08, Math.min(0.92, v))
          values.push(v)
        }
        // Lay series in three horizontal bands so they don't overlap too much.
        const bandTop = 0.10 + i * 0.27
        const bandBottom = bandTop + 0.55
        series.push({
          values,
          offset: 0,
          speed: 26 + i * 6,
          drift,
          volatility,
          style,
          verticalRange: [bandTop, bandBottom],
        })
      })
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(rect.width, window.innerWidth)
      height = Math.max(rect.height, window.innerHeight)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedSeries()
    }

    resize()
    window.addEventListener('resize', resize)

    // Render frame ----------------------------------------------------------
    const drawGrid = (gridOffset: number) => {
      ctx.lineWidth = 1
      ctx.strokeStyle = gridFaint
      ctx.beginPath()
      const startX = -((gridOffset) % GRID_SIZE)
      for (let x = startX; x < width + GRID_SIZE; x += GRID_SIZE) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
      }
      for (let y = 0; y < height; y += GRID_SIZE) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(width, Math.round(y) + 0.5)
      }
      ctx.stroke()

      // Brighter accent grid every 4 cells.
      ctx.strokeStyle = gridColor
      ctx.beginPath()
      const accentStartX = -((gridOffset) % (GRID_SIZE * 4))
      for (let x = accentStartX; x < width + GRID_SIZE * 4; x += GRID_SIZE * 4) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
      }
      for (let y = 0; y < height; y += GRID_SIZE * 4) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(width, Math.round(y) + 0.5)
      }
      ctx.stroke()
    }

    const yFor = (s: Series, v: number) => {
      const [t, b] = s.verticalRange
      const top = t * height
      const bottom = b * height
      return top + (1 - v) * (bottom - top)
    }

    const drawSeries = (s: Series) => {
      const samples = s.values.length
      const totalWidth = (samples - 1) * STEP

      // Smooth area fill (subtle).
      ctx.beginPath()
      ctx.moveTo(-s.offset, yFor(s, s.values[0]))
      for (let i = 1; i < samples; i += 1) {
        ctx.lineTo(i * STEP - s.offset, yFor(s, s.values[i]))
      }
      ctx.lineTo(totalWidth - s.offset, height)
      ctx.lineTo(-s.offset, height)
      ctx.closePath()
      const fill = ctx.createLinearGradient(0, 0, 0, height)
      fill.addColorStop(0, s.style.fillTop)
      fill.addColorStop(1, s.style.fillBottom)
      ctx.globalAlpha = FILL_OPACITY
      ctx.fillStyle = fill
      ctx.fill()

      // Stroke with neon glow.
      ctx.beginPath()
      ctx.moveTo(-s.offset, yFor(s, s.values[0]))
      for (let i = 1; i < samples; i += 1) {
        ctx.lineTo(i * STEP - s.offset, yFor(s, s.values[i]))
      }
      ctx.lineWidth = s.style.width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowBlur = 14
      ctx.shadowColor = s.style.glow
      ctx.strokeStyle = s.style.stroke
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    let last = performance.now()
    let rafId = 0
    let gridOffset = 0

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) // clamp to 50ms to avoid jumps
      last = now

      ctx.clearRect(0, 0, width, height)

      gridOffset = (gridOffset + dt * 30) % (GRID_SIZE * 4)
      drawGrid(gridOffset)

      series.forEach((s) => {
        s.offset += dt * s.speed
        while (s.offset >= STEP) {
          s.offset -= STEP
          s.values.shift()
          const prev = s.values[s.values.length - 1]
          let next = prev + s.drift * 0.012 + (Math.random() - 0.5) * s.volatility * 0.20
          next = Math.max(0.08, Math.min(0.92, next))
          s.values.push(next)
          // Occasionally flip the long-term drift to keep the chart from running off.
          if (Math.random() < 0.004) {
            s.drift = (Math.random() - 0.5) * 0.4
          }
        }
        drawSeries(s)
      })

      rafId = requestAnimationFrame(tick)
    }

    if (reducedMotion) {
      // Single static frame.
      ctx.clearRect(0, 0, width, height)
      drawGrid(0)
      series.forEach(drawSeries)
    } else {
      rafId = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="chart-background-canvas"
    />
  )
}
