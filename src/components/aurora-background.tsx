export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[8vw] -top-[10vw] h-[52vw] w-[52vw] rounded-full opacity-50 blur-[60px] motion-safe:animate-[aurora-drift_26s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #3a2bff, transparent 62%)', mixBlendMode: 'screen' }} />
      <div className="absolute -right-[6vw] top-[6vw] h-[46vw] w-[46vw] rounded-full opacity-50 blur-[60px] motion-safe:animate-[aurora-drift_30s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #00d6ff, transparent 62%)', mixBlendMode: 'screen' }} />
      <div className="absolute bottom-[-14vw] left-[28vw] h-[40vw] w-[40vw] rounded-full opacity-40 blur-[60px] motion-safe:animate-[aurora-drift_34s_ease-in-out_infinite]"
           style={{ background: 'radial-gradient(circle, #7b3bff, transparent 60%)', mixBlendMode: 'screen' }} />
    </div>
  )
}
