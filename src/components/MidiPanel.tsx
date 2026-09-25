import { useMidiStore } from '../midi/midiManager';
import { useMidiLearnStore } from '../midi/midiLearn';
import type { LearnTarget } from '../midi/midiLearn';

// ── Learnable parameters catalogue ────────────────────────────────────────────

interface LearnParam { target: LearnTarget; label: string; group: string }

const LEARN_PARAMS: LearnParam[] = [
  { target: 'bpm',              label: 'BPM',            group: 'Transport' },
  { target: 'track-0-volume',   label: 'Track 1 Vol',    group: 'Tracks' },
  { target: 'track-1-volume',   label: 'Track 2 Vol',    group: 'Tracks' },
  { target: 'track-2-volume',   label: 'Track 3 Vol',    group: 'Tracks' },
  { target: 'track-3-volume',   label: 'Track 4 Vol',    group: 'Tracks' },
  { target: 'track-4-volume',   label: 'Track 5 Vol',    group: 'Tracks' },
  { target: 'track-5-volume',   label: 'Track 6 Vol',    group: 'Tracks' },
  { target: 'track-0-mute',     label: 'Track 1 Mute',   group: 'Mutes' },
  { target: 'track-1-mute',     label: 'Track 2 Mute',   group: 'Mutes' },
  { target: 'track-2-mute',     label: 'Track 3 Mute',   group: 'Mutes' },
  { target: 'track-3-mute',     label: 'Track 4 Mute',   group: 'Mutes' },
  { target: 'track-4-mute',     label: 'Track 5 Mute',   group: 'Mutes' },
  { target: 'track-5-mute',     label: 'Track 6 Mute',   group: 'Mutes' },
  { target: 'effect-reverb',    label: 'FX Reverb',      group: 'FX' },
  { target: 'effect-delay',     label: 'FX Delay',       group: 'FX' },
  { target: 'effect-chorus',    label: 'FX Chorus',      group: 'FX' },
  { target: 'effect-bitcrusher',label: 'FX Bitcrusher',  group: 'FX' },
];

// Group by the group field so the UI can render section headers
const PARAM_GROUPS = LEARN_PARAMS.reduce<Record<string, LearnParam[]>>((acc, p) => {
  (acc[p.group] ??= []).push(p);
  return acc;
}, {});

// ── Shared style tokens ────────────────────────────────────────────────────────

const LABEL = 'text-[8px] text-[#00f0ff] uppercase tracking-widest font-bold opacity-60 block mb-1.5';
const SELECT = [
  'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2',
  'text-[11px] text-white outline-none cursor-pointer',
  'focus:border-[#00f0ff]/40 transition-colors',
  'appearance-none',
].join(' ');

// ── Component ──────────────────────────────────────────────────────────────────

export function MidiPanel() {
  const {
    isPanelOpen,
    isSupported,
    isConnected,
    inputPorts,
    outputPorts,
    selectedInputId,
    selectedOutputId,
    clockSyncEnabled,
    detectedBpm,
    selectInput,
    selectOutput,
    toggleClockSync,
    togglePanel,
  } = useMidiStore();

  const {
    mappings,
    isLearning,
    pendingTarget,
    startLearn,
    cancelLearn,
    removeMapping,
    clearAll,
  } = useMidiLearnStore();

  if (!isPanelOpen) return null;

  const statusColor = !isSupported
    ? '#FF4466'
    : isConnected
    ? '#00f0ff'
    : '#F9A826';

  const statusLabel = !isSupported ? 'Unsupported' : isConnected ? 'Connected' : 'Waiting…';

  return (
    <div
      className="absolute top-[110px] left-[248px] z-50 w-[268px] pointer-events-auto midi-panel-enter"
      aria-label="MIDI Configuration Panel"
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(4, 5, 12, 0.94)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(0, 240, 255, 0.15)',
          boxShadow:
            '0 0 0 1px rgba(157,78,221,0.08), 0 20px 60px rgba(0,0,0,0.7), inset 0 0 30px rgba(0,0,0,0.3)',
        }}
      >

        {/* ── Header ── */}
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2">
            {/* Status LED */}
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00f0ff]">
              MIDI I/O
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] uppercase tracking-widest" style={{ color: statusColor }}>
              {statusLabel}
            </span>
            {/* Close button */}
            <button
              onClick={togglePanel}
              aria-label="Close MIDI panel"
              className="w-5 h-5 flex items-center justify-center rounded text-[#6E7C9C] hover:text-white hover:bg-white/10 transition-all text-[11px] leading-none ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="p-4 space-y-4 overflow-y-auto midi-scroll" style={{ maxHeight: 'calc(100vh - 200px)' }}>

          {!isSupported && (
            <div className="px-3 py-2 rounded-lg bg-[#FF4466]/10 border border-[#FF4466]/30">
              <p className="text-[10px] text-[#FF4466]">
                Web MIDI is not supported in this browser. Try Chrome or Edge.
              </p>
            </div>
          )}

          {/* ── Input Device ── */}
          <div>
            <label className={LABEL}>Input Device</label>
            <div className="relative">
              <select
                value={selectedInputId ?? ''}
                onChange={(e) => selectInput(e.target.value || null)}
                className={SELECT}
                style={{ background: 'rgba(0,0,0,0.4)' }}
              >
                <option value="">— None —</option>
                {inputPorts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E7C9C] text-[8px]">▾</span>
            </div>
          </div>

          {/* ── Output Device ── */}
          <div>
            <label className={LABEL} style={{ color: '#c77dff' }}>Output Device</label>
            <div className="relative">
              <select
                value={selectedOutputId ?? ''}
                onChange={(e) => selectOutput(e.target.value || null)}
                className={SELECT}
                style={{ background: 'rgba(0,0,0,0.4)' }}
              >
                <option value="">— None —</option>
                {outputPorts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E7C9C] text-[8px]">▾</span>
            </div>
          </div>

          {/* ── Clock Sync ── */}
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <span className={LABEL} style={{ marginBottom: 0 }}>MIDI Clock Sync</span>
              <div className="mt-0.5 h-4">
                {clockSyncEnabled && detectedBpm ? (
                  <span className="text-[10px] text-[#9D4EDD] font-bold tabular-nums">
                    ♩ {detectedBpm} BPM
                  </span>
                ) : clockSyncEnabled ? (
                  <span className="text-[9px] text-[#6E7C9C] animate-pulse">Waiting for clock…</span>
                ) : (
                  <span className="text-[9px] text-[#2A2F3D]">Disabled</span>
                )}
              </div>
            </div>
            <button
              onClick={toggleClockSync}
              className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all duration-200 ${
                clockSyncEnabled
                  ? 'text-[#9D4EDD] border border-[#9D4EDD]/50'
                  : 'text-[#6E7C9C] border border-white/10 hover:border-white/20'
              }`}
              style={
                clockSyncEnabled
                  ? { background: 'rgba(157,78,221,0.15)', boxShadow: '0 0 10px rgba(157,78,221,0.25)' }
                  : { background: 'rgba(0,0,0,0.3)' }
              }
            >
              {clockSyncEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* ── Divider ── */}
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(157,78,221,0.3), transparent)' }} />

          {/* ── MIDI Learn ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] text-[#9D4EDD] uppercase tracking-[0.2em] font-bold opacity-80">
                MIDI Learn
              </span>
              <div className="flex gap-2">
                {isLearning && (
                  <button
                    onClick={cancelLearn}
                    className="text-[8px] text-[#FF4466] hover:text-red-300 uppercase tracking-wide transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {mappings.length > 0 && !isLearning && (
                  <button
                    onClick={clearAll}
                    className="text-[8px] text-[#6E7C9C] hover:text-white uppercase tracking-wide transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Learning indicator */}
            {isLearning && pendingTarget && (
              <div
                className="mb-3 px-3 py-2 rounded-lg"
                style={{
                  background: 'rgba(157,78,221,0.12)',
                  border: '1px solid rgba(157,78,221,0.5)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              >
                <span className="text-[10px] text-[#9D4EDD] font-bold block">● Move a MIDI CC knob…</span>
                <span className="text-[8px] text-[#6E7C9C]">Mapping: {pendingTarget}</span>
              </div>
            )}

            {/* Parameter groups */}
            {Object.entries(PARAM_GROUPS).map(([group, params]) => (
              <div key={group} className="mb-3">
                {/* Group label */}
                <div
                  className="flex items-center gap-2 mb-1.5"
                >
                  <span className="text-[7px] uppercase tracking-[0.25em] text-[#2A2F3D] font-bold">{group}</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                </div>

                {params.map(({ target, label }) => {
                  const mapped       = mappings.find((m) => m.target === target);
                  const isActiveLrn  = pendingTarget === target && isLearning;

                  return (
                    <div
                      key={target}
                      className="flex items-center justify-between px-2 py-[5px] rounded-lg transition-all duration-150 group"
                      style={{
                        background: isActiveLrn
                          ? 'rgba(157,78,221,0.12)'
                          : 'transparent',
                      }}
                    >
                      <span className="text-[10px] text-[#A0AEC0] group-hover:text-white transition-colors">
                        {label}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Mapped CC badge */}
                        {mapped && (
                          <>
                            <span className="text-[9px] font-mono text-[#00f0ff] tabular-nums">
                              CC{mapped.cc}
                            </span>
                            <button
                              onClick={() => removeMapping(mapped.cc)}
                              aria-label={`Remove CC${mapped.cc} mapping`}
                              className="text-[10px] leading-none text-[#6E7C9C] hover:text-[#FF4466] transition-colors"
                            >
                              ×
                            </button>
                          </>
                        )}

                        {/* Learn / Re-Learn button */}
                        <button
                          onClick={() =>
                            isActiveLrn ? cancelLearn() : startLearn(target, label)
                          }
                          className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wide font-bold transition-all duration-150 ${
                            isActiveLrn
                              ? 'bg-[#9D4EDD] text-white'
                              : 'text-[#6E7C9C] border border-white/10 hover:border-[#9D4EDD]/50 hover:text-[#9D4EDD]'
                          }`}
                        >
                          {isActiveLrn ? '●' : mapped ? 'Remap' : 'Learn'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {mappings.length === 0 && !isLearning && (
              <p className="text-center text-[9px] text-[#2A2F3D] py-2">
                No mappings yet — click Learn and move a knob.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
