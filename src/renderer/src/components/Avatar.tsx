import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  accountColorToCssBackground,
  avatarColorFor,
  bgToRingClass,
  initialsFor
} from '@/lib/avatar-color'
import { gravatarUrlForEmail } from '@/lib/gravatar'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASSES: Record<AvatarSize, { box: string; text: string }> = {
  xs: { box: 'h-5 w-5', text: 'text-[9px]' },
  sm: { box: 'h-7 w-7', text: 'text-[10px]' },
  md: { box: 'h-8 w-8', text: 'text-xs' },
  lg: { box: 'h-10 w-10', text: 'text-sm' },
  xl: { box: 'h-12 w-12', text: 'text-base' }
}

const GRAVATAR_PIXELS: Record<AvatarSize, number> = {
  xs: 40,
  sm: 56,
  md: 64,
  lg: 80,
  xl: 96
}

interface Props {
  name?: string | null
  email?: string | null
  /** Hintergrund der Initialen: Tailwind `bg-*` oder Hex (`#rrggbb`). */
  bgClass?: string | null
  /** Kontokennung (Tailwind `bg-*` oder Hex) — Ring um den Avatar. */
  accountColor?: string | null
  size?: AvatarSize
  /** Manuelle Initials – falls weder name noch email zuverlaessig sind. */
  initials?: string
  className?: string
  title?: string
  /**
   * Eigenes Profilbild (Data-URL) oder andere explizite Quelle.
   * Hat Vorrang vor Gravatar.
   */
  imageSrc?: string | null
  /**
   * Optional: Gravatar anhand der E-Mail (nur wenn kein `imageSrc` gesetzt ist).
   * Kein Treffer (404) → Initialen.
   */
  useGravatar?: boolean
}

export function Avatar({
  name,
  email,
  bgClass,
  accountColor,
  size = 'md',
  initials: initialsProp,
  className,
  title,
  imageSrc: imageSrcProp,
  useGravatar = false
}: Props): JSX.Element {
  const cls = SIZE_CLASSES[size]
  const seed = email || name || initialsProp || ''
  const palette = bgClass ? null : avatarColorFor(seed)
  const bgClassHex = bgClass ? accountColorToCssBackground(bgClass) : null
  const bgTailwind =
    bgClass && !bgClassHex ? bgClass : !bgClass ? (palette?.bg ?? 'bg-muted') : null
  const text = bgClass ? 'text-white' : palette?.text ?? 'text-foreground'
  const label = initialsProp ?? initialsFor(name, email)
  const accountRingHex = accountColor ? accountColorToCssBackground(accountColor) : null
  const ringClass =
    accountColor && !accountRingHex
      ? `${bgToRingClass(accountColor)} ring-1 ring-offset-1 ring-offset-card`
      : ''

  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [imageSrcProp, gravatarUrl])

  useEffect(() => {
    if (imageSrcProp || !useGravatar) {
      setGravatarUrl(null)
      return
    }
    const addr = email?.trim()
    if (!addr) {
      setGravatarUrl(null)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      const url = await gravatarUrlForEmail(addr, GRAVATAR_PIXELS[size])
      if (!cancelled && url) setGravatarUrl(url)
    })()
    return (): void => {
      cancelled = true
    }
  }, [email, imageSrcProp, useGravatar, size])

  const resolvedSrc = imageSrcProp || gravatarUrl || undefined
  const showImage = Boolean(resolvedSrc) && !imgFailed
  const inlineBg =
    !showImage && bgClassHex ? ({ backgroundColor: bgClassHex } as const) : undefined
  const ringShadow =
    accountRingHex != null
      ? ({ boxShadow: `0 0 0 1px ${accountRingHex}` } as const)
      : undefined

  return (
    <span
      title={title ?? (name ?? email ?? undefined)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none',
        cls.box,
        cls.text,
        !showImage && bgTailwind,
        !showImage && text,
        ringClass,
        className
      )}
      style={{ ...inlineBg, ...ringShadow }}
    >
      {showImage ? (
        <img
          src={resolvedSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={(): void => setImgFailed(true)}
        />
      ) : (
        label
      )}
    </span>
  )
}
