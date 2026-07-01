// Minimal ECB euro-reference-rates XML parser. No DOM dependency (this runs
// in Workers runtime which doesn't have one). Pure regex — the feed format
// is stable since 2002 and trivially regex-able.
//
// Expected shape:
//   <Cube time="YYYY-MM-DD">
//     <Cube currency="USD" rate="1.0823"/>
//     <Cube currency="GBP" rate="0.8556"/>
//     ...
//   </Cube>

export function parseEcbXml(xml: string): { date: string; rates: Record<string, number> } {
  const dateMatch = xml.match(/<Cube\s+time="(\d{4}-\d{2}-\d{2})"/)
  if (!dateMatch) throw new Error('ecb: no date found in XML')

  const rates: Record<string, number> = {}
  const cubeRegex = /<Cube\s+currency="([A-Z]{3})"\s+rate="([\d.]+)"\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = cubeRegex.exec(xml)) !== null) {
    const code = m[1]
    const rate = parseFloat(m[2])
    if (Number.isFinite(rate) && rate > 0) {
      rates[code] = rate
    }
  }

  if (Object.keys(rates).length === 0) {
    throw new Error('ecb: no rates parsed from XML')
  }

  return { date: dateMatch[1], rates }
}
