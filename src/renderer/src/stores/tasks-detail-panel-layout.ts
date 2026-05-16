import { create } from 'zustand'

export type TasksDetailPanelPlacement = 'dock' | 'float'

const K_DETAIL = 'mailclient.tasksPanel.detailPlacement'

function readPlacement(key: string, fallback: TasksDetailPanelPlacement): TasksDetailPanelPlacement {
  try {
    const v = window.localStorage.getItem(key)
    if (v === 'dock' || v === 'float') return v
  } catch {
    // ignore
  }
  return fallback
}

function writePlacement(key: string, value: TasksDetailPanelPlacement): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

interface TasksDetailPanelLayoutState {
  detailPlacement: TasksDetailPanelPlacement
  setDetailPlacement: (p: TasksDetailPanelPlacement) => void
}

export const useTasksDetailPanelLayoutStore = create<TasksDetailPanelLayoutState>((set) => ({
  /** Standard eingebettet; kann als Pop-up gelöst werden. */
  detailPlacement: readPlacement(K_DETAIL, 'dock'),
  setDetailPlacement(p): void {
    writePlacement(K_DETAIL, p)
    set({ detailPlacement: p })
  }
}))
