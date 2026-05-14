export type MetaFolderUiPreset = 'unread' | 'flagged' | 'attachments' | 'fulltext' | 'custom'

export interface MetaFolderExcRowState {
  id: string
  textQuery: string
  unread: boolean
  flagged: boolean
  attach: boolean
  from: string
}
