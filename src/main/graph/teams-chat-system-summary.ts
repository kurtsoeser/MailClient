/**
 * Lesbare Kurztexte fuer Microsoft Teams Systemnachrichten (Graph `eventDetail`).
 * @see https://learn.microsoft.com/en-us/graph/system-messages
 */

type EventDetail = Record<string, unknown> | null | undefined

interface GraphItemBodyLike {
  content?: string | null
  contentType?: string | null
}

function odataType(d: EventDetail): string {
  if (!d) return ''
  return String(d['@odata.type'] ?? '')
}

function memberPhrase(members: unknown): { names: string; count: number } {
  if (!Array.isArray(members)) return { names: '', count: 0 }
  const names = members
    .map((x) => String((x as { displayName?: string | null }).displayName ?? '').trim())
    .filter(Boolean)
    .join(', ')
  return { names, count: members.length }
}

/**
 * Erzeugt einen deutschsprachigen Infotext aus `eventDetail` einer `systemEventMessage`.
 */
export function summarizeTeamsSystemEvent(detail: EventDetail): string | null {
  if (!detail) return null
  const t = odataType(detail)

  if (t.includes('membersJoinedEventMessageDetail')) {
    const { names, count } = memberPhrase(detail['members'])
    if (names) return count > 1 ? `${names} sind dem Chat beigetreten.` : `${names} ist dem Chat beigetreten.`
    if (count > 0) return `${count} Teilnehmer sind dem Chat beigetreten.`
    return 'Jemand ist dem Chat beigetreten.'
  }

  if (t.includes('membersLeftEventMessageDetail')) {
    const { names, count } = memberPhrase(detail['members'])
    if (names) return count > 1 ? `${names} haben den Chat verlassen.` : `${names} hat den Chat verlassen.`
    if (count > 0) return `${count} Teilnehmer haben den Chat verlassen.`
    return 'Jemand hat den Chat verlassen.'
  }

  if (t.includes('membersAddedEventMessageDetail')) {
    const { names, count } = memberPhrase(detail['members'])
    if (names) return count > 1 ? `${names} wurden zum Chat hinzugefuegt.` : `${names} wurde zum Chat hinzugefuegt.`
    if (count > 0) return `${count} Teilnehmer wurden zum Chat hinzugefuegt.`
    return 'Teilnehmer wurden zum Chat hinzugefuegt.'
  }

  if (t.includes('membersDeletedEventMessageDetail')) {
    const { names, count } = memberPhrase(detail['members'])
    if (names) return count > 1 ? `${names} wurden aus dem Chat entfernt.` : `${names} wurde aus dem Chat entfernt.`
    if (count > 0) return `${count} Teilnehmer wurden aus dem Chat entfernt.`
    return 'Teilnehmer wurden aus dem Chat entfernt.'
  }

  if (t.includes('chatRenamedEventMessageDetail')) {
    const name = String(detail['chatDisplayName'] ?? '').trim()
    return name ? `Der Chat wurde in "${name}" umbenannt.` : 'Der Chat wurde umbenannt.'
  }

  if (t.includes('meetingPolicyUpdatedEventMessageDetail')) {
    return 'Besprechungs- oder Chat-Richtlinien wurden aktualisiert.'
  }

  if (t.includes('teamsAppInstalledEventMessageDetail')) {
    const app = String(detail['teamsAppDisplayName'] ?? detail['teamsAppId'] ?? '').trim()
    return app ? `Die App "${app}" wurde in diesem Chat hinzugefuegt.` : 'Eine App wurde in diesem Chat hinzugefuegt.'
  }
  if (t.includes('teamsAppRemovedEventMessageDetail')) {
    const app = String(detail['teamsAppDisplayName'] ?? detail['teamsAppId'] ?? '').trim()
    return app ? `Die App "${app}" wurde aus diesem Chat entfernt.` : 'Eine App wurde aus diesem Chat entfernt.'
  }
  if (t.includes('teamsAppUpgradedEventMessageDetail')) {
    const app = String(detail['teamsAppDisplayName'] ?? detail['teamsAppId'] ?? '').trim()
    return app ? `Die App "${app}" wurde aktualisiert.` : 'Eine App wurde aktualisiert.'
  }

  if (t.includes('callStartedEventMessageDetail')) {
    return 'Anruf oder Besprechung wurde gestartet.'
  }
  if (t.includes('callEndedEventMessageDetail')) {
    return 'Anruf oder Besprechung wurde beendet.'
  }
  if (t.includes('callRecordingEventMessageDetail')) {
    return 'Eine Besprechungsaufzeichnung ist verfuegbar.'
  }
  if (t.includes('callTranscriptEventMessageDetail')) {
    return 'Ein Besprechungsprotokoll (Transkript) ist verfuegbar.'
  }

  if (t.includes('messagePinnedEventMessageDetail')) {
    return 'Eine Nachricht wurde angeheftet.'
  }
  if (t.includes('messageUnpinnedEventMessageDetail')) {
    return 'Eine Nachricht wurde gelöst.'
  }

  if (t.includes('tabUpdatedEventMessageDetail')) {
    const tab = String(detail['tabDisplayName'] ?? '').trim()
    return tab ? `Die Registerkarte "${tab}" wurde aktualisiert.` : 'Eine Registerkarte wurde aktualisiert.'
  }

  if (t.includes('conversationMemberRoleUpdatedEventMessageDetail')) {
    return 'Die Rolle eines Teilnehmers wurde geändert.'
  }

  const short = t.replace('#microsoft.graph.', '').replace(/EventMessageDetail$/i, '')
  return short ? `Aktivität: ${short}` : null
}

export function isTeamsSystemEventPlaceholderBody(body: GraphItemBodyLike | null | undefined): boolean {
  const c = body?.content?.replace(/\s/g, '') ?? ''
  return /^<systemeventmessage\/?>$/i.test(c)
}
