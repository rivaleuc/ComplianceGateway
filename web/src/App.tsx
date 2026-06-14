import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { read, write, CONTRACT, connectWallet, isWalletConnected } from './genlayer'

type Risk = 'low' | 'medium' | 'high'
type LogEntry = {
  id: number
  address: string
  risk: Risk
  ts: string
  reason: string
}

const RISK_META: Record<Risk, { label: string; color: string; ring: string; arc: number; glow: string }> = {
  low: { label: 'CLEARED', color: '#2DD4A7', ring: 'text-teal-300', arc: 0.18, glow: 'rgba(16,185,129,0.5)' },
  medium: { label: 'REVIEW', color: '#F59E0B', ring: 'text-amber-400', arc: 0.55, glow: 'rgba(245,158,11,0.5)' },
  high: { label: 'BLOCKED', color: '#EF4444', ring: 'text-red-500', arc: 0.92, glow: 'rgba(239,68,68,0.55)' },
}

const SEED: LogEntry[] = [
  { id: 1, address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', risk: 'low', ts: '21:04:11', reason: 'No OFAC match · clean trail' },
  { id: 2, address: '0x000000000000000000000000000000000000dEaD', risk: 'high', ts: '21:03:47', reason: 'SDN list hit · sanctioned entity' },
  { id: 3, address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', risk: 'medium', ts: '21:01:09', reason: 'Indirect exposure · 2 hops to flagged' },
  { id: 4, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', risk: 'low', ts: '20:58:32', reason: 'No OFAC match · verified counterparty' },
]

function Gauge({ risk, scanning }: { risk: Risk | null; scanning: boolean }) {
  const meta = risk ? RISK_META[risk] : null
  const target = scanning ? 0.5 : meta ? meta.arc : 0
  const color = scanning ? '#60A5FA' : meta ? meta.color : '#334155'
  const R = 86
  const C = Math.PI * R // semicircle length
  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="220" height="130" viewBox="0 0 220 130">
        <path d="M 24 118 A 86 86 0 0 1 196 118" fill="none" stroke="#26262B" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M 24 118 A 86 86 0 0 1 196 118"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - target), stroke: color }}
          transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          style={{ filter: meta ? `drop-shadow(0 0 6px ${meta.glow})` : undefined }}
        />
      </svg>
      <div className="-mt-16 flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={scanning ? 'scan' : risk ?? 'idle'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="font-mono text-2xl font-bold tracking-tight"
            style={{ color }}
          >
            {scanning ? '· · ·' : meta ? meta.label : 'READY'}
          </motion.span>
        </AnimatePresence>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          {scanning ? 'analyzing' : risk ? `${risk} risk` : 'awaiting input'}
        </span>
      </div>
    </div>
  )
}

export default function App() {
  const [addr, setAddr] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<Risk | null>(null)
  const [log, setLog] = useState<LogEntry[]>(SEED)
  const [phase, setPhase] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(100)
  const [stats, setStats] = useState<{ total: number; blocked: number } | null>(null)
  const [walletAddr, setWalletAddr] = useState<string | null>(null)

  async function handleConnect() {
    try {
      const a = await connectWallet()
      setWalletAddr(a.slice(0, 6) + '…' + a.slice(-4))
      toast.success('Wallet connected')
    } catch (e: any) {
      toast.error(e.message || 'Connect failed')
    }
  }

  const total = stats?.total ?? log.length
  const blocked = stats?.blocked ?? log.filter((l) => l.risk === 'high').length
  const flagged = log.filter((l) => l.risk !== 'low').length

  useEffect(() => {
    read('stats')
      .then((s: any) => {
        setStats({
          total: Number(s?.total_screens ?? s?.[0] ?? 0),
          blocked: Number(s?.blocked ?? s?.[1] ?? 0),
        })
      })
      .catch(() => {
        /* keep local fallback on read failure */
      })
  }, [])

  useEffect(() => {
    if (!scanning) return
    const steps = ['querying SDN registry…', 'tracing fund provenance…', 'computing risk vector…']
    let i = 0
    setPhase(steps[0])
    const t = setInterval(() => {
      i++
      setPhase(steps[i % steps.length])
    }, 900)
    return () => clearInterval(t)
  }, [scanning])

  async function screen() {
    const value = addr.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      toast.error('Invalid address', { description: 'Provide a valid 0x… 40-hex wallet address.' })
      return
    }
    setScanning(true)
    setResult(null)
    toast('Screening initiated', { description: `${value.slice(0, 10)}…${value.slice(-6)} · finalizing on-chain` })
    try {
      await write('screen', [value, 'transfer'])
      const s: any = await read('stats')
      const totalScreens = Number(s?.total_screens ?? s?.[0] ?? 0)
      setStats({ total: totalScreens, blocked: Number(s?.blocked ?? s?.[1] ?? 0) })

      const v: any = await read('read_verdict', [String(totalScreens - 1)])
      const compliant = v?.is_compliant ?? v?.[1]
      const rl = String(v?.risk_level ?? v?.[2] ?? '').toLowerCase()
      const reasoning = String(v?.reasoning ?? v?.[3] ?? '') || 'On-chain verdict returned.'

      let risk: Risk
      if (rl.includes('high')) risk = 'high'
      else if (rl.includes('med')) risk = 'medium'
      else if (rl.includes('low')) risk = 'low'
      else risk = compliant ? 'low' : 'high'

      const entry: LogEntry = {
        id: idRef.current++,
        address: value,
        risk,
        ts: new Date().toLocaleTimeString('en-GB'),
        reason: reasoning,
      }
      setLog((l) => [entry, ...l])
      setResult(risk)
      if (risk === 'high') toast.error('SANCTIONS MATCH', { description: 'Funds held in escrow. Transfer blocked.' })
      else if (risk === 'medium') toast.warning('Manual review required', { description: reasoning })
      else toast.success('Compliant — escrow released', { description: reasoning })
    } catch (e: any) {
      toast.error('Screening failed', { description: e?.message ?? String(e) })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-zinc-200 font-sans selection:bg-teal-500/30">
      <Toaster theme="dark" position="top-right" richColors />
      {/* grid backdrop */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(#26262B 1px, transparent 1px), linear-gradient(90deg, #26262B 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-7">
        {/* top status bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative h-3 w-3">
              <span className="absolute inset-0 animate-ping rounded-full bg-teal-500/70" />
              <span className="absolute inset-0 rounded-full bg-teal-300" />
            </div>
            <div>
              <h1 className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-zinc-100">
                Compliance<span className="text-teal-300">Gateway</span>
              </h1>
              <p className="font-mono text-[10px] text-zinc-500">OFAC · SDN · SANCTIONS SCREENING TERMINAL</p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <span className="rounded border border-zinc-700 px-2 py-1">NODE · GENLAYER</span>
            <span className="hidden rounded border border-zinc-700 px-2 py-1 sm:inline">
              {CONTRACT.slice(0, 8)}…{CONTRACT.slice(-6)}
            </span>
            <button
              onClick={handleConnect}
              className={`rounded border px-2 py-1 font-mono uppercase tracking-wider transition ${
                isWalletConnected()
                  ? 'border-teal-500/60 bg-teal-500/10 text-teal-300'
                  : 'border-zinc-700 text-zinc-300 hover:border-teal-500/70 hover:text-teal-300'
              }`}
            >
              {walletAddr ? `● ${walletAddr}` : 'Connect Wallet'}
            </button>
          </div>
        </header>

        {/* command console */}
        <section className="mt-8 flex flex-col items-center text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-zinc-500">screen a wallet</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
            Verify before you settle.
          </h2>
          <div className="mt-6 w-full max-w-3xl">
            <div
              className={`flex items-stretch overflow-hidden rounded-xl border bg-[#101013] shadow-2xl transition-colors ${
                scanning ? 'border-blue-500/60' : 'border-zinc-700 focus-within:border-teal-500/70'
              }`}
            >
              <span className="flex items-center pl-4 font-mono text-teal-300">{'>'}</span>
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !scanning && screen()}
                placeholder="0x000000000000000000000000000000000000dEaD"
                disabled={scanning}
                className="flex-1 bg-transparent px-3 py-4 font-mono text-sm tracking-tight text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
              />
              <button
                onClick={screen}
                disabled={scanning}
                className="group relative m-1.5 flex items-center gap-2 rounded-lg bg-teal-500 px-6 font-mono text-sm font-bold uppercase tracking-wider text-zinc-900 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {scanning ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-zinc-400 border-t-transparent"
                  />
                ) : (
                  '⟫'
                )}
                {scanning ? 'screening' : 'screen'}
              </button>
            </div>
            <AnimatePresence>
              {scanning && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 font-mono text-xs text-blue-400"
                >
                  ▸ {phase}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* main grid: gauge + stats | log */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1.4fr]">
          {/* left: gauge + stats */}
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-[#101013] p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">risk vector</span>
                <span className="font-mono text-[10px] text-zinc-600">REALTIME</span>
              </div>
              <div className="mt-3 flex justify-center">
                <Gauge risk={result} scanning={scanning} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px]">
                <div className="rounded-md border border-teal-500/20 bg-teal-500/5 py-2 text-center text-teal-300">
                  LOW · cleared
                </div>
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 py-2 text-center text-amber-400">
                  MED · review
                </div>
                <div className="rounded-md border border-red-500/20 bg-red-500/5 py-2 text-center text-red-400">
                  HIGH · blocked
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { k: 'screened', v: total, c: 'text-zinc-100' },
                { k: 'flagged', v: flagged, c: 'text-amber-400' },
                { k: 'blocked', v: blocked, c: 'text-red-500' },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className={`font-mono text-3xl font-bold tabular-nums ${s.c}`}>
                    {String(s.v).padStart(2, '0')}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{s.k}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-400">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-teal-300">⛓</span>
                <p>
                  Funds remain <span className="text-teal-300">escrowed on-chain</span> until the counterparty clears
                  sanctions screening. High-risk addresses are frozen automatically by the gateway contract.
                </p>
              </div>
            </div>
          </div>

          {/* right: screening log */}
          <div className="flex flex-col rounded-2xl border border-zinc-800 bg-[#101013]">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">screening_log</span>
              <span className="font-mono text-[10px] text-zinc-600">{log.length} records</span>
            </div>
            <div ref={logRef} className="max-h-[420px] flex-1 space-y-2 overflow-y-auto p-3">
              <AnimatePresence initial={false}>
                {log.map((e) => {
                  const m = RISK_META[e.risk]
                  return (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                      className="group rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-zinc-300">{e.address}</span>
                        <span
                          className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                          style={{ color: m.color, background: `${m.color}1a` }}
                        >
                          ● {m.label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                        <span>{e.reason}</span>
                        <span className="tabular-nums">{e.ts}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            <div className="border-t border-zinc-800 px-5 py-2.5 font-mono text-[10px] text-zinc-600">
              gateway://screen · escrow-locked · audit-trail immutable
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
