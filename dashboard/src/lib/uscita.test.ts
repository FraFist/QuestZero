import { describe, expect, it } from 'vitest'
import { avviaUscita, fineUscita, inUscita } from './uscita'

describe("uscita animata dalla pagina di accesso", () => {
  it("non è attiva finché il login non riesce", () => {
    fineUscita()
    expect(inUscita()).toBe(false)
  })

  it("dopo il login resta attiva per un tempo limitato, poi si spegne da sola", () => {
    avviaUscita(1_000)
    expect(inUscita(1_100)).toBe(true)
    expect(inUscita(10_000)).toBe(false)
  })

  it("fineUscita la chiude subito", () => {
    avviaUscita(Date.now())
    fineUscita()
    expect(inUscita()).toBe(false)
  })
})
