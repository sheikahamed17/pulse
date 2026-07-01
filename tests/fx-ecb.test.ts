import { describe, it, expect } from 'vitest'
import { parseEcbXml } from '@/lib/fx-ecb'

// Minimal valid ECB feed shape — official format published since 2002.
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender>
    <gesmes:name>European Central Bank</gesmes:name>
  </gesmes:Sender>
  <Cube>
    <Cube time="2026-06-18">
      <Cube currency="USD" rate="1.0823"/>
      <Cube currency="GBP" rate="0.8556"/>
      <Cube currency="INR" rate="90.4715"/>
      <Cube currency="JPY" rate="171.42"/>
      <Cube currency="AED" rate="3.9755"/>
      <Cube currency="SGD" rate="1.4682"/>
      <Cube currency="AUD" rate="1.6258"/>
      <Cube currency="CAD" rate="1.4783"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

describe('parseEcbXml', () => {
  it('extracts the date', () => {
    const out = parseEcbXml(SAMPLE_XML)
    expect(out.date).toBe('2026-06-18')
  })

  it('extracts all currency rates', () => {
    const out = parseEcbXml(SAMPLE_XML)
    expect(out.rates.USD).toBe(1.0823)
    expect(out.rates.INR).toBe(90.4715)
    expect(out.rates.JPY).toBe(171.42)
    expect(Object.keys(out.rates).length).toBe(8)
  })

  it('throws on malformed XML (no Cube time)', () => {
    const bad = '<gesmes:Envelope><Cube></Cube></gesmes:Envelope>'
    expect(() => parseEcbXml(bad)).toThrow(/no date/i)
  })

  it('throws on empty rates', () => {
    const bad = `<gesmes:Envelope xmlns="x"><Cube><Cube time="2026-06-18"></Cube></Cube></gesmes:Envelope>`
    expect(() => parseEcbXml(bad)).toThrow(/no rates/i)
  })
})
