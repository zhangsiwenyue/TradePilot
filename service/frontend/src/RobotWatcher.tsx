import { useEffect, useRef } from 'react'

import { useTheme } from './appShared'

/**
 * Animated AI robot watching a live stock chart inside its screen.
 *
 * - Robot head with blinking eyes and pulsing antenna.
 * - Chest "screen" renders a tiny live-updating candlestick chart.
 * - Scanning beam sweeps across the screen.
 * - Floating data chips (BTC, NVDA, ETH...) drift around the robot.
 * - Adapts to dark / light theme.
 */
export function RobotWatcher() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  // Tiny live candlestick chart inside the robot's chest screen.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isLight = theme === 'light'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssWidth = 240
    const cssHeight = 120
    canvas.width = cssWidth * dpr
    canvas.height = cssHeight * dpr
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const upColor = '#10b981'
    const downColor = '#ef4444'
    const wickAlpha = isLight ? 0.75 : 0.9
    const gridColor = isLight ? 'rgba(56, 84, 130, 0.18)' : 'rgba(34, 211, 238, 0.16)'
    const lineColor = isLight ? 'rgba(8, 145, 178, 0.85)' : 'rgba(34, 211, 238, 0.85)'

    type Candle = { o: number; h: number; l: number; c: number }
    const CANDLES = 22
    const padding = 8
    const chartW = cssWidth - padding * 2
    const chartH = cssHeight - padding * 2
    const candleW = chartW / CANDLES

    const candles: Candle[] = []
    let last = 0.55
    for (let i = 0; i < CANDLES; i += 1) {
      const open = last
      const drift = (Math.random() - 0.5) * 0.06
      const close = Math.max(0.08, Math.min(0.92, open + drift))
      const high = Math.max(open, close) + Math.random() * 0.04
      const low = Math.min(open, close) - Math.random() * 0.04
      candles.push({ o: open, h: Math.min(0.96, high), l: Math.max(0.04, low), c: close })
      last = close
    }

    const draw = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight)

      // Gridlines
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let g = 0; g < 4; g += 1) {
        const y = padding + (chartH / 3) * g + 0.5
        ctx.moveTo(padding, y)
        ctx.lineTo(padding + chartW, y)
      }
      ctx.stroke()

      // Trend line through closes
      ctx.beginPath()
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1.2
      candles.forEach((c, i) => {
        const x = padding + candleW * i + candleW / 2
        const y = padding + (1 - c.c) * chartH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Candles
      candles.forEach((c, i) => {
        const x = padding + candleW * i + candleW * 0.18
        const w = candleW * 0.64
        const isUp = c.c >= c.o
        const color = isUp ? upColor : downColor
        const yHigh = padding + (1 - c.h) * chartH
        const yLow = padding + (1 - c.l) * chartH
        const yOpen = padding + (1 - c.o) * chartH
        const yClose = padding + (1 - c.c) * chartH
        // Wick
        ctx.globalAlpha = wickAlpha
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + w / 2, yHigh)
        ctx.lineTo(x + w / 2, yLow)
        ctx.stroke()
        // Body
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        const bodyTop = Math.min(yOpen, yClose)
        const bodyH = Math.max(2, Math.abs(yClose - yOpen))
        ctx.fillRect(x, bodyTop, w, bodyH)
      })
    }

    draw()

    let raf = 0
    let lastShift = performance.now()
    const tick = (now: number) => {
      if (now - lastShift > 900) {
        lastShift = now
        // Drop first candle, push a new one continuing from last close.
        candles.shift()
        const open = candles[candles.length - 1].c
        const drift = (Math.random() - 0.5) * 0.08
        const close = Math.max(0.08, Math.min(0.92, open + drift))
        const high = Math.max(open, close) + Math.random() * 0.05
        const low = Math.min(open, close) - Math.random() * 0.05
        candles.push({ o: open, h: Math.min(0.96, high), l: Math.max(0.04, low), c: close })
        draw()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [theme])

  return (
    <div className="robot-watcher" aria-hidden="true">
      <div className="robot-floats">
        <span className="robot-chip chip-1">BTC <em>+2.4%</em></span>
        <span className="robot-chip chip-2">NVDA <em>+5.1%</em></span>
        <span className="robot-chip chip-3 down">ETH <em>-1.2%</em></span>
        <span className="robot-chip chip-4">POLY YES</span>
      </div>

      <svg
        className="robot-svg"
        viewBox="0 0 320 360"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="robotBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a2042" />
            <stop offset="100%" stopColor="#0d1124" />
          </linearGradient>
          <linearGradient id="robotPanel" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="robotEye" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Floor reflection */}
        <ellipse cx="160" cy="335" rx="120" ry="10" fill="url(#eyeGlow)" opacity="0.45" />

        {/* Antenna */}
        <g className="robot-antenna">
          <line x1="160" y1="22" x2="160" y2="58" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="160" cy="18" r="6" fill="#22d3ee" filter="url(#neonGlow)" />
          <circle className="robot-antenna-pulse" cx="160" cy="18" r="6" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
        </g>

        {/* Head */}
        <g className="robot-head">
          <rect x="78" y="58" width="164" height="118" rx="28" fill="url(#robotBody)" stroke="rgba(34,211,238,0.45)" strokeWidth="1.5" />
          {/* Head highlight */}
          <rect x="86" y="66" width="148" height="14" rx="10" fill="rgba(255,255,255,0.04)" />

          {/* Side bolts */}
          <circle cx="78" cy="120" r="6" fill="#0d1124" stroke="rgba(139,92,246,0.6)" strokeWidth="1.2" />
          <circle cx="242" cy="120" r="6" fill="#0d1124" stroke="rgba(139,92,246,0.6)" strokeWidth="1.2" />

          {/* Eye visor */}
          <rect x="100" y="92" width="120" height="48" rx="14" fill="#04060f" stroke="rgba(34,211,238,0.35)" strokeWidth="1.2" />

          {/* Eyes */}
          <g className="robot-eyes" filter="url(#neonGlow)">
            <circle cx="132" cy="116" r="10" fill="url(#robotEye)" />
            <circle cx="188" cy="116" r="10" fill="url(#robotEye)" />
          </g>

          {/* Eye scan beam */}
          <rect className="robot-scan" x="100" y="92" width="120" height="48" rx="14" fill="url(#eyeGlow)" opacity="0.0" />

          {/* Mouth / vent */}
          <g>
            <rect x="138" y="152" width="44" height="6" rx="3" fill="rgba(34,211,238,0.5)" />
            <rect x="146" y="160" width="28" height="3" rx="1.5" fill="rgba(139,92,246,0.45)" />
          </g>

          {/* Cheek lights */}
          <circle className="robot-cheek robot-cheek-l" cx="92" cy="148" r="3" fill="#22d3ee" />
          <circle className="robot-cheek robot-cheek-r" cx="228" cy="148" r="3" fill="#8b5cf6" />
        </g>

        {/* Neck */}
        <rect x="148" y="176" width="24" height="14" fill="#1a2042" stroke="rgba(34,211,238,0.3)" strokeWidth="1" />
        <rect x="146" y="186" width="28" height="6" rx="2" fill="#0d1124" />

        {/* Body / chest screen frame */}
        <g>
          <rect x="40" y="192" width="240" height="140" rx="22" fill="url(#robotBody)" stroke="rgba(165,180,252,0.25)" strokeWidth="1.5" />

          {/* Screen inset (canvas overlays this area via CSS positioning) */}
          <rect x="56" y="208" width="208" height="108" rx="12" fill="#04060f" stroke="url(#robotPanel)" strokeWidth="1.5" />

          {/* LED row */}
          <g className="robot-leds">
            <circle cx="60" cy="320" r="3" fill="#10b981" />
            <circle cx="72" cy="320" r="3" fill="#22d3ee" />
            <circle cx="84" cy="320" r="3" fill="#8b5cf6" />
            <circle cx="252" cy="320" r="3" fill="#fbbf24" />
            <circle cx="264" cy="320" r="3" fill="#ef4444" />
          </g>
        </g>

        {/* Arms (hint of arms folded behind body) */}
        <rect x="20" y="216" width="22" height="80" rx="11" fill="#0d1124" stroke="rgba(139,92,246,0.35)" strokeWidth="1" />
        <rect x="278" y="216" width="22" height="80" rx="11" fill="#0d1124" stroke="rgba(34,211,238,0.35)" strokeWidth="1" />
      </svg>

      {/* Chest screen — live mini chart canvas */}
      <canvas ref={canvasRef} className="robot-screen-canvas" />
    </div>
  )
}
