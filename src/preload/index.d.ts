import type { MailClientApi } from './index'

declare global {
  interface Window {
    mailClient: MailClientApi
  }
}

export {}
