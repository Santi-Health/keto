import { useMemo } from 'react'
import { useData } from './data'
import { fitKetoModel } from './ketoModel'

/** The personal ketosis model, refitted whenever readings, meals or workouts change. */
export function useKetoModel(netCarbLimit: number, proteinTarget: number) {
  const { readings, logs, exercises } = useData()
  const ketoneReadings = useMemo(() => readings.filter((r) => r.kind === 'blood_ketone'), [readings])
  return useMemo(
    () => fitKetoModel({ readings: ketoneReadings, logs, exercises, netCarbLimit, proteinTarget }),
    [ketoneReadings, logs, exercises, netCarbLimit, proteinTarget],
  )
}
