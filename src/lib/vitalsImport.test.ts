import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeActivity } from './activity'
import { fetchActivity } from './googleHealth'

describe('importing overnight vitals', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads breathing rate, skin temperature and blood oxygen by day, from further back when asked', async () => {
    const urls: string[] = []
    const date = { year: 2026, month: 10, day: 29 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(decodeURIComponent(String(url).replace(/\+/g, ' ')))
        const body = String(url).includes('daily-respiratory-rate')
          ? { dataPoints: [{ dailyRespiratoryRate: { date, breathsPerMinute: 16.24 } }] }
          : String(url).includes('daily-sleep-temperature-derivations')
            ? { dataPoints: [{ dailySleepTemperatureDerivations: { date, nightlyTemperatureCelsius: 34.71, baselineTemperatureCelsius: 33.52 } }] }
            : String(url).includes('daily-oxygen-saturation')
              ? { dataPoints: [{ dailyOxygenSaturation: { date, averagePercentage: 94.6, lowerBoundPercentage: 93, upperBoundPercentage: 96 } }] }
              : {}
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const imp = await fetchActivity('t', '2026-11-02', '2026-11-08', '2026-10-10')
    expect(imp.vitals['2026-10-29']).toEqual({ breathingRate: 16.2, skinTempC: 34.71, skinTempBaseC: 33.52, spo2Pct: 94.6 })
    expect(urls.find((u) => u.includes('daily-respiratory-rate'))).toContain('daily_respiratory_rate.date >= "2026-10-10"')
    const [d] = mergeActivity(imp, {})
    expect(d.meta).toMatchObject({ breathingRate: 16.2, skinTempC: 34.71, spo2Pct: 94.6 })
  })
})
