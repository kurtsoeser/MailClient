/**
 * Erzeugt die durchsuchbare Kalender-Icon-Katalogdatei aus lucide-react.
 * Ausführen: npm run generate:calendar-icons
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { icons } from 'lucide-react'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../src/renderer/src/lib/generated')
const outFile = join(outDir, 'calendar-event-icon-catalog.json')

/** PascalCase (Lucide) → kebab-case (persistierte ID). */
function pascalToKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function lucideDisplayName(pascal) {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
}

/** Zusätzliche Suchbegriffe (DE/EN) für ältere gespeicherte IDs. */
const EXTRA_KEYWORDS = {
  car: ['auto', 'fahrzeug'],
  plane: ['flug', 'flugzeug', 'reise'],
  luggage: ['koffer', 'reise', 'gepäck'],
  bus: ['öpnv', 'verkehr'],
  bike: ['fahrrad', 'rad'],
  truck: ['lkw', 'lieferung'],
  trophy: ['pokal', 'sport', 'sieg'],
  music: ['musik', 'konzert'],
  soccer: ['fußball', 'sport', 'ball'],
  film: ['kino', 'movie'],
  'book-open': ['buch', 'lesen'],
  dumbbell: ['fitness', 'sport', 'gym'],
  sneaker: ['laufen', 'sport', 'schuh'],
  target: ['ziel'],
  home: ['haus', 'zuhause'],
  users: ['gruppe', 'team', 'leute'],
  user: ['person', 'menschen'],
  party: ['feier', 'geburtstag'],
  heart: ['liebe', 'gesundheit'],
  cake: ['geburtstag', 'kuchen'],
  'graduation-cap': ['schule', 'uni', 'abschluss'],
  'palm-tree': ['urlaub', 'strand', 'ferien'],
  clipboard: ['liste', 'aufgaben'],
  'first-aid': ['gesundheit', 'arzt', 'medizin', 'stethoscope'],
  pill: ['medizin', 'apotheke'],
  stopwatch: ['zeit', 'timer'],
  star: ['favorit', 'wichtig'],
  dining: ['essen', 'restaurant', 'food'],
  tv: ['fernsehen', 'serie'],
  ticket: ['event', 'konzert'],
  card: ['kreditkarte', 'bezahlen'],
  buildings: ['stadt', 'büro', 'building'],
  wrench: ['reparatur', 'werkzeug'],
  check: ['erledigt', 'fertig', 'done'],
  notes: ['notizen', 'notiz'],
  'map-pin': ['ort', 'location', 'karte'],
  meeting: ['besprechung', 'video', 'call'],
  calendar: ['termin', 'kalender', 'default'],
  stethoscope: ['arzt', 'gesundheit', 'doctor'],
  'party-popper': ['feier', 'party'],
  utensils: ['essen', 'restaurant'],
  video: ['meeting', 'call', 'kamera'],
  footprints: ['laufen', 'walk']
}

const entries = Object.keys(icons)
  .sort((a, b) => a.localeCompare(b))
  .map((pascal) => {
    const id = pascalToKebab(pascal)
    const label = lucideDisplayName(pascal)
    const extra = EXTRA_KEYWORDS[id] ?? []
    const search = [id, id.replace(/-/g, ' '), label, pascal, ...extra]
      .join(' ')
      .toLowerCase()
    return { id, l: label, s: search }
  })

/** Legacy-IDs, die von Lucide-Kebab abweichen (bestehende DB-Einträge). */
const legacyOnly = Object.keys(EXTRA_KEYWORDS).filter(
  (id) => !entries.some((e) => e.id === id)
)
for (const id of legacyOnly) {
  const extra = EXTRA_KEYWORDS[id] ?? []
  entries.push({
    id,
    l: id.replace(/-/g, ' '),
    s: [id, id.replace(/-/g, ' '), ...extra].join(' ').toLowerCase()
  })
}

entries.sort((a, b) => a.id.localeCompare(b.id))

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outFile,
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), icons: entries }, null, 0)
)
console.log(`Wrote ${entries.length} icons to ${outFile}`)
