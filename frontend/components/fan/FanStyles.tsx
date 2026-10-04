// Local keyframes + print rules for the fan pages (globals.css is not ours to edit). Rendered once by <JourneyRail />.
export default function FanStyles() {
  return (
    <style>{`
      @keyframes fan-scan { 0% { transform: translateY(-110%); } 100% { transform: translateY(110%); } }
      @keyframes fan-pop { 0% { transform: scale(.55) rotate(-8deg); opacity: 0; } 60% { transform: scale(1.05) rotate(1deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
      @keyframes fan-shine { from { background-position: 220% 0; } to { background-position: -120% 0; } }
      @keyframes fan-ring { from { transform: scale(.6); opacity: .8; } to { transform: scale(2.2); opacity: 0; } }
      @keyframes fan-flick { 0%, 100% { opacity: 1; } 8% { opacity: .55; } 12% { opacity: 1; } 55% { opacity: .85; } }
      .fan-scan { animation: fan-scan 1.5s linear infinite; }
      .fan-pop { animation: fan-pop .7s cubic-bezier(.2,.8,.2,1) both; }
      .fan-shine { background-image: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.35) 48%, transparent 60%); background-size: 220% 100%; animation: fan-shine 3.2s ease-in-out infinite; }
      .fan-ring { animation: fan-ring 1.8s ease-out infinite; }
      .fan-flick { animation: fan-flick 3s steps(1) infinite; }
      @media (prefers-reduced-motion: reduce) { .fan-scan, .fan-shine, .fan-ring, .fan-flick { animation: none !important; } }
      @media print {
        .fan-print, .fan-print * { color: #000 !important; border-color: #000 !important; text-shadow: none !important; box-shadow: none !important; }
        .fan-print { background: #fff !important; -webkit-mask: none !important; mask: none !important; }
        .fan-print .fan-keep-bg { background: #fff !important; }
        .fan-print .fan-barcode { color: #000 !important; }
        .fan-noprint { display: none !important; }
      }
    `}</style>
  );
}
