// Simbolo QuestZero che si disegna all'apertura, come prevede la guida del logo
// (brand/logo/GUIDA-LOGO.md, "Movimento"): il punto compare, la linea percorre la Z,
// la freccia scatta a destra. Una volta sola; con "riduci animazioni" è già completo.
// Tracciati identici a brand/logo/kit/simbolo/questzero-simbolo-bianco.svg, divisi in tre parti.
import { useId } from 'react'

const Z = 'M88 43H192A14 14 0 0 1 201.9 66.9L97.8 171H188V199H64A14 14 0 0 1 54.1 175.1L158.2 71H88Z'
const PUNTO = 'M32 57A18 18 0 1 1 68 57A18 18 0 1 1 32 57Z'
const FRECCIA =
  'M190.66 150.01L226.66 182.01A4 4 0 0 1 226.66 187.99L190.66 219.99A4 4 0 0 1 184 217L184 153A4 4 0 0 1 190.66 150.01Z'
// La via di fuga: il centro della Z, da sinistra in alto a destra in basso.
const PERCORSO = 'M88 57H195L68 185H188'

export function SimboloAnimato({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`simbolo-animato ${className ?? ''}`} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <defs>
        <mask id={`via-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
          <path
            className="simbolo-via"
            d={PERCORSO}
            pathLength={1}
            fill="none"
            stroke="#fff"
            strokeWidth={36}
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <g transform="translate(-20.57 -23.57) scale(1.14)" fill="currentColor">
        <path className="simbolo-punto" d={PUNTO} />
        <path d={Z} mask={`url(#via-${id})`} />
        <path className="simbolo-freccia" d={FRECCIA} />
      </g>
    </svg>
  )
}
