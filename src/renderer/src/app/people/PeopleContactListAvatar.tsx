import { useEffect, useRef, useState } from 'react'
import type { PeopleContactView } from '@shared/types'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import { bgToRingClass } from '@/lib/avatar-color'
import { useContactPhotoDataUrl } from '@/app/people/useContactPhotoDataUrl'

interface PeopleContactListAvatarProps {
  contact: PeopleContactView
  displayName: string
  accountColor?: string | null
}

/**
 * Listen-Avatar: lokales Kontaktfoto lazy nach Sichtbarkeit, sonst Gravatar (wenn E-Mail), sonst Initialen.
 */
export function PeopleContactListAvatar({
  contact,
  displayName,
  accountColor
}: PeopleContactListAvatarProps): JSX.Element {
  const rootRef = useRef<HTMLSpanElement>(null)
  const [loadLocalPhoto, setLoadLocalPhoto] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLoadLocalPhoto(true)
      },
      { root: null, rootMargin: '160px 0px', threshold: 0.01 }
    )
    io.observe(el)
    return (): void => io.disconnect()
  }, [])

  const hasLocal = Boolean(contact.photoLocalPath?.trim())
  const localUrl = useContactPhotoDataUrl(
    contact.id,
    contact.photoLocalPath,
    loadLocalPhoto && hasLocal,
    contact.updatedLocal ?? null
  )

  const ringCls = accountColor ? bgToRingClass(accountColor) : ''

  return (
    <span ref={rootRef} className="inline-flex shrink-0">
      <Avatar
        name={displayName}
        email={contact.primaryEmail}
        imageSrc={localUrl}
        useGravatar={!hasLocal}
        accountColor={accountColor ?? null}
        size="md"
        className={cn('!h-9 !w-9 ring-2 ring-offset-2 ring-offset-background', ringCls)}
      />
    </span>
  )
}
