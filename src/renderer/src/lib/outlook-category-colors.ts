/**
 * Microsoft Graph `categoryColor` -> kleine Farbpunkte in der UI.
 * @see https://learn.microsoft.com/en-us/graph/api/resources/outlookcategory
 */
const PRESET_DOT: Record<string, string> = {
  none: 'bg-zinc-500',
  preset0: 'bg-rose-400',
  preset1: 'bg-orange-400',
  preset2: 'bg-amber-400',
  preset3: 'bg-yellow-400',
  preset4: 'bg-green-400',
  preset5: 'bg-teal-400',
  preset6: 'bg-cyan-400',
  preset7: 'bg-sky-400',
  preset8: 'bg-blue-500',
  preset9: 'bg-indigo-400',
  preset10: 'bg-violet-400',
  preset11: 'bg-purple-400',
  preset12: 'bg-fuchsia-400',
  preset13: 'bg-pink-400',
  preset14: 'bg-rose-300',
  preset15: 'bg-orange-300',
  preset16: 'bg-lime-400',
  preset17: 'bg-emerald-400',
  preset18: 'bg-stone-400',
  preset19: 'bg-neutral-500',
  preset20: 'bg-red-600',
  preset21: 'bg-orange-600',
  preset22: 'bg-lime-600',
  preset23: 'bg-emerald-600',
  preset24: 'bg-blue-700'
}

export function outlookCategoryDotClass(color: string | null | undefined): string {
  if (!color) return 'bg-zinc-500'
  const k = color.trim().toLowerCase()
  return PRESET_DOT[k] ?? 'bg-slate-400'
}

export const OUTLOOK_COLOR_PRESET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'preset0', label: 'Rot' },
  { value: 'preset1', label: 'Orange' },
  { value: 'preset2', label: 'Bernstein' },
  { value: 'preset3', label: 'Gelb' },
  { value: 'preset4', label: 'Gruen' },
  { value: 'preset5', label: 'Teal' },
  { value: 'preset6', label: 'Cyan' },
  { value: 'preset7', label: 'Himmelblau' },
  { value: 'preset8', label: 'Blau' },
  { value: 'preset9', label: 'Indigo' },
  { value: 'preset10', label: 'Violett' },
  { value: 'preset11', label: 'Lila' },
  { value: 'preset12', label: 'Magenta' },
  { value: 'preset13', label: 'Pink' },
  { value: 'preset14', label: 'Rose (hell)' },
  { value: 'preset15', label: 'Orange (hell)' },
  { value: 'preset16', label: 'Lime' },
  { value: 'preset17', label: 'Smaragd' },
  { value: 'preset18', label: 'Stein' },
  { value: 'preset19', label: 'Neutral' },
  { value: 'preset20', label: 'Rot (dunkel)' },
  { value: 'preset21', label: 'Orange (dunkel)' },
  { value: 'preset22', label: 'Lime (dunkel)' },
  { value: 'preset23', label: 'Smaragd (dunkel)' },
  { value: 'preset24', label: 'Blau (dunkel)' }
]
