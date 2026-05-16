import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './stores/locale'
import { App } from './App'
import { TeamsChatPopoutShell } from './app/chat/TeamsChatPopoutShell'
import { isTeamsChatPopoutWindow } from './app/chat/teams-chat-popout-route'
import './styles/globals.css'
// Theme-Store frueh laden, damit der Side-Effect (.dark-Klasse auf
// documentElement) vor dem ersten Render greift und kein Flash entsteht.
import './stores/theme'

const RootShell = isTeamsChatPopoutWindow() ? TeamsChatPopoutShell : App

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootShell />
  </React.StrictMode>
)
