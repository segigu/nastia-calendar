const COBURG_COORDS = {
  latitude: 50.2584,
  longitude: 10.9629,
};

const WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_TIMEZONE = 'Europe/Berlin';

type WeatherCode =
  | 0
  | 1
  | 2
  | 3
  | 45
  | 48
  | 51
  | 53
  | 55
  | 56
  | 57
  | 61
  | 63
  | 65
  | 66
  | 67
  | 71
  | 73
  | 75
  | 77
  | 80
  | 81
  | 82
  | 85
  | 86
  | 95
  | 96
  | 99;

const WEATHER_CODE_DESCRIPTIONS: Record<WeatherCode, string> = {
  0: 'неожиданно ясным небом',
  1: 'почти ясным небом',
  2: 'переменной облачностью',
  3: 'сплошной серостью',
  45: 'густым туманом',
  48: 'изморозью и туманом',
  51: 'легкой моросью',
  53: 'моросящим дождём',
  55: 'затяжным моросящим дождём',
  56: 'ледяной моросью',
  57: 'ледяным дождём',
  61: 'лёгким дождиком',
  63: 'обычным дождём',
  65: 'ливнем',
  66: 'ледяным дождём',
  67: 'ледяным ливнем',
  71: 'порошей',
  73: 'нормальным снегом',
  75: 'снежной бурей',
  77: 'ледяной крупой',
  80: 'короткими ливнями',
  81: 'дождевыми шквалами',
  82: 'трёхактным ураганным ливнем',
  85: 'снежными зарядами',
  86: 'плотными снежными зарядами',
  95: 'грязным грозовым шоу',
  96: 'грязной грозой с градом',
  99: 'адским градом',
};

interface WeatherQueryOptions {
  startDate: string;
  endDate: string;
  signal?: AbortSignal;
}

interface DailyWeatherData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  weathercode: number[];
  windspeed_10m_max?: number[];
}

interface WeatherApiResponse {
  daily?: DailyWeatherData;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function buildQueryUrl({ startDate, endDate }: WeatherQueryOptions): string {
  const params = new URLSearchParams({
    latitude: COBURG_COORDS.latitude.toString(),
    longitude: COBURG_COORDS.longitude.toString(),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'weathercode',
      'windspeed_10m_max',
    ].join(','),
    timezone: WEATHER_TIMEZONE,
    start_date: startDate,
    end_date: endDate,
  });

  return `${WEATHER_BASE_URL}?${params.toString()}`;
}

async function fetchWeatherRange(options: WeatherQueryOptions): Promise<DailyWeatherData | null> {
  try {
    const url = buildQueryUrl(options);
    const response = await fetch(url, { signal: options.signal });

    if (!response.ok) {
      console.warn('[Weather] Failed to fetch forecast:', response.status, response.statusText);
      return null;
    }

    const payload = (await response.json()) as WeatherApiResponse;
    if (!payload.daily || !Array.isArray(payload.daily.time)) {
      console.warn('[Weather] Unexpected forecast payload structure.');
      return null;
    }

    return payload.daily;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null;
    }
    console.warn('[Weather] Forecast request failed:', error);
    return null;
  }
}

function mapWeatherCode(code: number | undefined): string {
  if (code == null) {
    return 'странным небом без подробностей';
  }

  const mapped = WEATHER_CODE_DESCRIPTIONS[code as WeatherCode];
  if (mapped) {
    return mapped;
  }

  if (code >= 50 && code < 60) {
    return 'дождливой нудятиной';
  }
  if (code >= 60 && code < 70) {
    return 'дождём сомнительного настроения';
  }
  if (code >= 70 && code < 80) {
    return 'снежным сюрпризом';
  }
  if (code >= 80 && code < 90) {
    return 'дождливыми вспышками';
  }
  if (code >= 90) {
    return 'грозовым цирком';
  }

  return 'непредсказуемыми капризами';
}

function formatNumber(value: number | undefined | null, digits = 0): string | null {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(digits);
}

function formatDayName(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date);
}

function capitalize(text: string): string {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDayList(days: string[]): string {
  if (days.length === 0) {
    return '';
  }

  if (days.length === 1) {
    return days[0];
  }

  if (days.length === 2) {
    return `${days[0]} и ${days[1]}`;
  }

  return `${days.slice(0, -1).join(', ')} и ${days[days.length - 1]}`;
}

export async function fetchDailyWeatherSummary(
  isoDate: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const daily = await fetchWeatherRange({
    startDate: isoDate,
    endDate: isoDate,
    signal,
  });

  if (!daily) {
    return null;
  }

  const index = daily.time.findIndex(entry => entry === isoDate);
  if (index === -1) {
    return null;
  }

  const dayName = capitalize(formatDayName(isoDate));
  const tempMax = formatNumber(daily.temperature_2m_max[index]);
  const tempMin = formatNumber(daily.temperature_2m_min[index]);
  const precipProb = formatNumber(daily.precipitation_probability_max?.[index]);
  const precipSum = formatNumber(daily.precipitation_sum?.[index], 1);
  const wind = formatNumber(daily.windspeed_10m_max?.[index]);
  const weatherFlavor = mapWeatherCode(daily.weathercode[index]);

  const segments: string[] = [];
  segments.push(`${dayName} пахнет ${weatherFlavor}`);
  if (tempMax && tempMin) {
    segments.push(`температура скачет от ${tempMin}°C до ${tempMax}°C`);
  } else if (tempMax) {
    segments.push(`максимум около ${tempMax}°C`);
  }

  if (precipProb) {
    segments.push(`шанс осадков примерно ${precipProb}%`);
  } else if (precipSum && Number(precipSum) > 0) {
    segments.push(`осадков навалит около ${precipSum} мм`);
  }

  if (wind) {
    segments.push(`ветер разгонится до ${wind} км/ч`);
  }

  return segments.join(', ');
}

export async function fetchWeeklyWeatherSummary(
  isoDate: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const start = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const endIso = toISODate(end);

  const daily = await fetchWeatherRange({
    startDate: isoDate,
    endDate: endIso,
    signal,
  });

  if (!daily) {
    return null;
  }

  const tempsMax = daily.temperature_2m_max.filter(value => value != null && !Number.isNaN(value));
  const tempsMin = daily.temperature_2m_min.filter(value => value != null && !Number.isNaN(value));
  const maxTemp = tempsMax.length ? Math.max(...tempsMax) : null;
  const minTemp = tempsMin.length ? Math.min(...tempsMin) : null;

  const precipDays: string[] = [];
  let peakPrecipProb = 0;
  let peakPrecipDay = '';

  daily.time.forEach((day, index) => {
    const prob = daily.precipitation_probability_max?.[index] ?? 0;
    if (prob >= 55) {
      precipDays.push(formatDayName(day));
    }
    if (prob > peakPrecipProb) {
      peakPrecipProb = prob;
      peakPrecipDay = formatDayName(day);
    }
  });

  let dominantCode: number | null = null;
  const codeCounts = new Map<number, number>();
  daily.weathercode.forEach(code => {
    const current = codeCounts.get(code) ?? 0;
    codeCounts.set(code, current + 1);
    if (!dominantCode || codeCounts.get(code)! > (codeCounts.get(dominantCode) ?? 0)) {
      dominantCode = code;
    }
  });

  const dominantDescription = mapWeatherCode(dominantCode ?? undefined);
  const segments: string[] = [];

  segments.push(`Неделя отыгрывается ${dominantDescription}`);

  if (maxTemp !== null && minTemp !== null) {
    segments.push(`температура прыгает от ${minTemp.toFixed(0)}°C до ${maxTemp.toFixed(0)}°C`);
  } else if (maxTemp !== null) {
    segments.push(`максимум дотянет до ${maxTemp.toFixed(0)}°C`);
  }

  if (precipDays.length > 0) {
    const formattedDays = formatDayList(precipDays.map(capitalize));
    segments.push(`самые мокрые дни — ${formattedDays}`);
  } else if (peakPrecipProb >= 30 && peakPrecipDay) {
    segments.push(`осадки возможны ближе к ${capitalize(peakPrecipDay)} (до ${peakPrecipProb}% вероятности)`);
  }

  const windValues = daily.windspeed_10m_max?.filter(value => value != null && !Number.isNaN(value)) ?? [];
  if (windValues.length > 0) {
    const maxWind = Math.max(...windValues);
    if (maxWind >= 35) {
      segments.push(`ветер раздухарится до ${maxWind.toFixed(0)} км/ч`);
    } else if (maxWind >= 20) {
      segments.push(`ветер временами поддувает до ${maxWind.toFixed(0)} км/ч`);
    }
  }

  return segments.join(', ');
}
