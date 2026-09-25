import { useRef } from "react";
import { useMusicStore, INSTRUMENT_ORDER } from "../store/musicState";
import type { InstrumentType } from "../store/musicState";

interface InstrumentMeta {
  type: InstrumentType;
  label: string;
  flavor: string;
  shortcut: string;
  waveClass: string;
  accentColor: string;
  svgPath: string;
}

const INSTRUMENTS: InstrumentMeta[] = [
  {
    type: "Subtractive",
    label: "Subtractive",
    flavor: "Classic Analog Saw",
    shortcut: "1",
    waveClass: "waveform-saw",
    accentColor: "#c77dff",
    svgPath: "M0,20 L8,0 L8,40 L16,0 L16,40 L24,0 L24,40 L32,20",
  },
  {
    type: "FM",
    label: "FM Synth",
    flavor: "Warm FM Bell",
    shortcut: "2",
    waveClass: "waveform-fm",
    accentColor: "#00f0ff",
    svgPath: "M0,20 Q4,0 8,20 Q10,30 12,20 Q16,5 20,20 Q22,32 24,20 Q28,2 32,20",
  },
  {
    type: "Electric Piano",
    label: "Elec. Piano",
    flavor: "Rhodes-Style Keys",
    shortcut: "3",
    waveClass: "waveform-ep",
    accentColor: "#F9A826",
    svgPath: "M0,20 Q8,0 16,20 Q24,40 32,20",
  },
  {
    type: "Pad",
    label: "Pad",
    flavor: "Lush Slow-Attack",
    shortcut: "4",
    waveClass: "waveform-pad",
    accentColor: "#9D4EDD",
    svgPath: "M0,20 Q4,18 8,20 Q12,22 16,18 Q20,14 24,20 Q28,26 32,20",
  },
];

export function InstrumentPanel() {
  const currentInstrument = useMusicStore((s) => s.currentInstrument);
  const setMusicState = useMusicStore((s) => s.setMusicState);
  const flashKeyRef = useRef<Record<InstrumentType, number>>({
    Subtractive: 0,
    FM: 0,
    "Electric Piano": 0,
    Pad: 0,
  });

  const handleSelect = (type: InstrumentType) => {
    setMusicState({ currentInstrument: type });
    flashKeyRef.current[type] = Date.now();
  };

  return (
    <div
      className="absolute top-[140px] right-6 z-40 flex flex-col gap-2 pointer-events-none w-52 instrument-panel-enter"
      aria-label="Instrument Selector"
    >
      {/* Panel Header */}
      <div className="pointer-events-auto flex items-center justify-between bg-black/80 backdrop-blur-3xl border-b-2 border-t border-l border-r border-t-transparent border-l-transparent border-r-transparent border-b-[var(--color-secondary)] px-3 py-1.5 shadow-[0_5px_15px_rgba(0,240,255,0.1)] rounded-t-lg">
        <span className="text-[9px] text-[var(--color-metal-light)] font-bold uppercase tracking-widest">
          Sound <span className="text-[var(--color-secondary)]">Engine</span>
        </span>
        <span className="text-[7px] text-[var(--color-metal-light)]/50 font-mono uppercase tracking-wider hidden sm:block">
          swipe / key
        </span>
      </div>

      {/* Instrument Cards */}
      <div className="flex flex-col gap-1.5">
        {INSTRUMENTS.map((inst) => {
          const isActive = currentInstrument === inst.type;
          const orderIdx = INSTRUMENT_ORDER.indexOf(inst.type);

          return (
            <button
              key={inst.type}
              id={`instrument-card-${orderIdx + 1}`}
              aria-label={`Select ${inst.label} instrument`}
              aria-pressed={isActive}
              onClick={() => handleSelect(inst.type)}
              className={[
                "pointer-events-auto relative overflow-hidden flex items-center gap-2.5",
                "border-l-2 border rounded-r-md px-2.5 py-2",
                "text-left transition-all duration-200 group",
                isActive
                  ? "bg-black/80 instrument-card-active"
                  : "bg-black/50 backdrop-blur-xl border-l-[var(--color-metal)] border-[var(--color-metal-dark)] hover:bg-black/70 hover:border-l-[var(--color-metal-light)]",
              ].join(" ")}
              style={
                isActive
                  ? {
                      borderLeftColor: inst.accentColor,
                      borderTopColor: inst.accentColor + "33",
                      borderRightColor: inst.accentColor + "33",
                      borderBottomColor: inst.accentColor + "33",
                    }
                  : undefined
              }
            >
              {/* Animated waveform background */}
              <span
                className={`absolute inset-0 pointer-events-none ${inst.waveClass}`}
                aria-hidden="true"
              />

              {/* SVG waveform icon */}
              <span className="relative shrink-0 w-8 h-8 flex items-center justify-center">
                <svg viewBox="0 0 32 40" className="w-7 h-7" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path
                    d={inst.svgPath}
                    stroke={isActive ? inst.accentColor : "rgba(110,124,156,0.7)"}
                    strokeWidth={isActive ? 2 : 1.5}
                    className="transition-all duration-200"
                    style={isActive ? { filter: `drop-shadow(0 0 4px ${inst.accentColor})` } : undefined}
                  />
                </svg>
              </span>

              {/* Text content */}
              <span className="relative flex flex-col min-w-0">
                <span
                  className={`text-[11px] font-bold tracking-wider truncate transition-colors duration-200 ${
                    isActive ? "text-white" : "text-[var(--color-metal-light)] group-hover:text-white"
                  }`}
                  style={isActive ? { textShadow: `0 0 10px ${inst.accentColor}` } : undefined}
                >
                  {inst.label}
                </span>
                <span className="text-[8px] text-[var(--color-metal-light)]/50 tracking-wide truncate">
                  {inst.flavor}
                </span>
              </span>

              {/* Keyboard shortcut badge */}
              <span
                className={`relative ml-auto shrink-0 w-4 h-4 flex items-center justify-center rounded text-[8px] font-mono font-bold border transition-all duration-200 ${
                  isActive
                    ? "text-[var(--color-secondary)]"
                    : "border-[var(--color-metal)] text-[var(--color-metal-light)]/40 group-hover:border-[var(--color-metal-light)] group-hover:text-[var(--color-metal-light)]"
                }`}
                style={isActive ? { borderColor: inst.accentColor + "99", color: inst.accentColor } : undefined}
              >
                {inst.shortcut}
              </span>

              {/* Active left-edge accent pulse */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-full"
                  style={{ background: inst.accentColor, boxShadow: `0 0 6px ${inst.accentColor}` }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[var(--color-secondary)]/20 to-transparent" />
        <span className="text-[7px] text-[var(--color-metal-light)]/30 font-mono uppercase tracking-widest whitespace-nowrap">
          Keys 1-4 · Tab
        </span>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[var(--color-secondary)]/20 to-transparent" />
      </div>
    </div>
  );
}
