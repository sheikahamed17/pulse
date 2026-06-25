// Curated subset of the IANA tz database — ~200 entries favoring populated
// regions. Full feed at https://www.iana.org/time-zones. Phase 2 ships this
// hardcoded; Phase 3 can swap to a runtime fetch or @vvo/tzdb if needed.

export const IANA_TIMEZONES: readonly string[] = [
  // UTC
  'UTC',

  // Africa
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos',
  'Africa/Nairobi', 'Africa/Tunis',

  // America — North
  'America/Anchorage', 'America/Chicago', 'America/Denver', 'America/Detroit',
  'America/Edmonton', 'America/Halifax', 'America/Indiana/Indianapolis',
  'America/Los_Angeles', 'America/Mexico_City', 'America/Monterrey',
  'America/New_York', 'America/Phoenix', 'America/Toronto', 'America/Vancouver',
  'America/Winnipeg',

  // America — Central / South
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Caracas',
  'America/Costa_Rica', 'America/Guatemala', 'America/Havana', 'America/Lima',
  'America/Managua', 'America/Panama', 'America/Santiago', 'America/Sao_Paulo',

  // Antarctica
  'Antarctica/Casey', 'Antarctica/McMurdo',

  // Asia
  'Asia/Almaty', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Baku',
  'Asia/Bangkok', 'Asia/Beirut', 'Asia/Colombo', 'Asia/Dhaka', 'Asia/Dubai',
  'Asia/Hong_Kong', 'Asia/Irkutsk', 'Asia/Istanbul', 'Asia/Jakarta',
  'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Karachi', 'Asia/Kathmandu',
  'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Kuwait', 'Asia/Manila',
  'Asia/Muscat', 'Asia/Nicosia', 'Asia/Omsk', 'Asia/Pyongyang', 'Asia/Qatar',
  'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Taipei', 'Asia/Tashkent', 'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Tokyo',
  'Asia/Vladivostok', 'Asia/Yekaterinburg', 'Asia/Yerevan',

  // Atlantic
  'Atlantic/Azores', 'Atlantic/Bermuda', 'Atlantic/Canary',
  'Atlantic/Cape_Verde', 'Atlantic/Reykjavik', 'Atlantic/South_Georgia',

  // Australia
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin',
  'Australia/Hobart', 'Australia/Lord_Howe', 'Australia/Melbourne',
  'Australia/Perth', 'Australia/Sydney',

  // Europe
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin',
  'Europe/Bratislava', 'Europe/Brussels', 'Europe/Bucharest', 'Europe/Budapest',
  'Europe/Chisinau', 'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Gibraltar',
  'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kiev', 'Europe/Lisbon',
  'Europe/Ljubljana', 'Europe/London', 'Europe/Luxembourg', 'Europe/Madrid',
  'Europe/Malta', 'Europe/Minsk', 'Europe/Monaco', 'Europe/Moscow',
  'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Riga',
  'Europe/Rome', 'Europe/Samara', 'Europe/Sarajevo', 'Europe/Skopje',
  'Europe/Sofia', 'Europe/Stockholm', 'Europe/Tallinn', 'Europe/Tirane',
  'Europe/Vaduz', 'Europe/Vienna', 'Europe/Vilnius', 'Europe/Warsaw',
  'Europe/Zagreb', 'Europe/Zurich',

  // Indian Ocean
  'Indian/Maldives', 'Indian/Mauritius', 'Indian/Reunion',

  // Pacific
  'Pacific/Apia', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Easter',
  'Pacific/Fiji', 'Pacific/Galapagos', 'Pacific/Gambier', 'Pacific/Guam',
  'Pacific/Honolulu', 'Pacific/Marquesas', 'Pacific/Midway', 'Pacific/Niue',
  'Pacific/Noumea', 'Pacific/Pago_Pago', 'Pacific/Pitcairn', 'Pacific/Tahiti',
  'Pacific/Tarawa', 'Pacific/Tongatapu', 'Pacific/Wake',
] as const
