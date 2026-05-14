export interface SidebarInlineEditState {
  mode: 'rename' | 'create'
  folderId?: number
  parentFolderId: number | null
  accountId: string
  initialValue: string
}
