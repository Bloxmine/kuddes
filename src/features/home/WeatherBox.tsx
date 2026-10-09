import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Box } from '../../components/ui/Box'
import { errorMessage } from '../../lib/api'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'

const POSTCODE_KEY = 'kuddes.postcode'

type Weather = {
  place: string
  temperature: number
  max: number
  rainChance: number
  code: number
}

// WMO weather codes, grouped
function describe(code: number): { icon: FarmIconName; text: string } {
  if (code === 0) return { icon: 'weather_sun', text: 'zonnig' }
  if (code <= 2) return { icon: 'sun_cloudy', text: 'licht bewolkt' }
  if (code === 3) return { icon: 'weather_clouds', text: 'bewolkt' }
  if (code <= 48) return { icon: 'weather_sun_fog', text: 'mistig' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: 'weather_rain', text: 'regen' }
  if (code <= 77 || code === 85 || code === 86) return { icon: 'weather_snow', text: 'sneeuw' }
  return { icon: 'weather_lightning', text: 'onweer' }
}

/** What to wear today, in a few words. */
function advice(w: Weather): { icon: FarmIconName; text: string } {
  const wet = w.rainChance >= 50 || ['regen', 'onweer'].includes(describe(w.code).text)
  if (wet) return { icon: 'umbrella', text: 'Neem je paraplu mee' }
  if (w.max >= 22 && w.code <= 2) return { icon: 'weather_sun', text: 'Zonnebril op en naar buiten' }
  if (w.max <= 6) return { icon: 'weather_snow', text: 'Muts en sjaal, het is koud' }
  return { icon: 'weather_cloudy', text: 'Een jasje is genoeg' }
}

async function fetchWeather(postcode: string): Promise<Weather> {
  // NL postcodes are "1234AB"; the digits are enough to find the town. BE uses 4 digits.
  const digits = postcode.replace(/\s/g, '').match(/^(\d{4})([a-z]{2})?$/i)?.[1]
  if (!digits) throw new Error('Vul een geldige postcode in, bijv. 3511AB of 1000.')

  let place: { name: string; latitude: number; longitude: number; timezone: string } | undefined
  for (const country of ['NL', 'BE']) {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${digits}&count=1&language=nl&countryCode=${country}`,
    )
    place = (await res.json()).results?.[0]
    if (place) break
  }
  if (!place) throw new Error('Deze postcode kennen we niet.')

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,precipitation_probability_max',
    timezone: place.timezone,
    forecast_days: '1',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Het weerbericht is nu niet beschikbaar.')
  const data = await res.json()
  return {
    place: place.name,
    temperature: Math.round(data.current.temperature_2m),
    max: Math.round(data.daily.temperature_2m_max[0]),
    rainChance: data.daily.precipitation_probability_max[0] ?? 0,
    code: data.current.weather_code,
  }
}

function readPostcode() {
  try {
    return localStorage.getItem(POSTCODE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** "Het weer bij jou": today's weather for a postcode, via Open-Meteo. */
export function WeatherBox() {
  const [postcode, setPostcode] = useState(readPostcode)
  const weather = useMutation({
    mutationFn: fetchWeather,
    onSuccess: () => {
      try {
        localStorage.setItem(POSTCODE_KEY, postcode)
      } catch {
        // not remembered, that's fine
      }
    },
  })
  const w = weather.data
  const tip = w && advice(w)

  return (
    <Box title="Het weer bij jou" icon="sun_cloudy" className="weather-box">
      <span id="weer" />
      {w && tip ? (
        <div className="wx">
          <div className="wx-now">
            <FarmIcon name={describe(w.code).icon} size={48} />
            <span className="wx-temp">{w.temperature}°</span>
            <span className="wx-place">
              <b>{w.place}</b>
              <span>
                {describe(w.code).text}, straks {w.max}°
              </span>
            </span>
          </div>
          <div className="wx-rain" title={`${w.rainChance}% kans op regen`}>
            <span className="wx-rain-label">Regen</span>
            <span className="wx-rain-bar">
              <span style={{ width: `${Math.min(100, Math.max(0, w.rainChance))}%` }} />
            </span>
            <span className="wx-rain-pct">{w.rainChance}%</span>
          </div>
          <p className="wx-tip">
            <FarmIcon name={tip.icon} /> {tip.text}
          </p>
          <button type="button" className="link-button wx-change" onClick={() => weather.reset()}>
            Ergens anders kijken
          </button>
        </div>
      ) : (
        <form
          className="wx-ask"
          onSubmit={(e) => {
            e.preventDefault()
            weather.mutate(postcode)
          }}
        >
          <label htmlFor="wx-postcode">Wat voor weer wordt het vandaag? Typ je postcode, dan zie je het meteen.</label>
          <span className="wx-field">
            <input id="wx-postcode" className="text-box" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Je postcode" maxLength={8} />
            <button type="submit" className="wx-go" disabled={weather.isPending || !postcode.trim()} title="Kijk" aria-label="Kijk">
              <FarmIcon name="arrow_right" />
            </button>
          </span>
          {weather.isError && <p className="form-error">{errorMessage(weather.error)}</p>}
        </form>
      )}
      <p className="weather-note">Weerdata van Open-Meteo. Je postcode blijft in je eigen browser.</p>
    </Box>
  )
}
