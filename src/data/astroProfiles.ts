export interface AstroProfile {
  id: 'nastia' | 'sergey' | 'sveta' | 'damir' | 'michelle';
  name: string;
  birthDate: string; // ISO YYYY-MM-DD
  birthTime?: string; // HH:mm (24h). Defaults to noon if missing
  timeZone: string; // IANA timezone, e.g., Europe/Kyiv
  latitude: number;
  longitude: number;
  notes?: string;
}

export const ASTRO_PROFILES: Record<AstroProfile['id'], AstroProfile> = {
  nastia: {
    id: 'nastia',
    name: 'Настя',
    birthDate: '1992-04-12',
    birthTime: '22:45',
    timeZone: 'Asia/Yakutsk',
    latitude: 71.6833,
    longitude: 128.8667,
    notes: 'Тикси, Россия (UTC+9). Координаты и время уточнены.',
  },
  sergey: {
    id: 'sergey',
    name: 'Сергей',
    birthDate: '1979-12-13',
    birthTime: '13:30',
    timeZone: 'Asia/Novokuznetsk',
    latitude: 53.9833,
    longitude: 86.6667,
    notes: 'Киселёвск, Россия (UTC+7).',
  },
  sveta: {
    id: 'sveta',
    name: 'Света',
    birthDate: '1970-07-05',
    birthTime: '09:00',
    timeZone: 'Europe/Kyiv',
    latitude: 46.6183,
    longitude: 31.5411,
    notes: 'Дата условная, уточнить при возможности.',
  },
  damir: {
    id: 'damir',
    name: 'Дамир',
    birthDate: '2020-05-15',
    birthTime: '14:45',
    timeZone: 'Europe/Kyiv',
    latitude: 46.6183,
    longitude: 31.5411,
    notes: 'Дата условная, уточнить при возможности.',
  },
  michelle: {
    id: 'michelle',
    name: 'Мишель',
    birthDate: '2023-03-17',
    birthTime: '06:20',
    timeZone: 'Europe/Kyiv',
    latitude: 46.6183,
    longitude: 31.5411,
    notes: 'Дата условная, уточнить при возможности.',
  },
};

export const PRIMARY_PROFILE_ID: AstroProfile['id'] = 'nastia';
