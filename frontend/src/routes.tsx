import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ChatPage } from './features/chat/ChatPage'

const ExplorerPage = lazy(() => import('./features/explorer/ExplorerPage').then((module) => ({ default: module.ExplorerPage })))
const AboutPage = lazy(() => import('./features/about/AboutPage').then((module) => ({ default: module.AboutPage })))

function RouteLoading() {
  return <div className="route-loading" role="status">Loading archive…</div>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'explore', element: <Suspense fallback={<RouteLoading />}><ExplorerPage /></Suspense> },
      { path: 'about', element: <Suspense fallback={<RouteLoading />}><AboutPage /></Suspense> },
      {
        path: '*',
        element: (
          <section className="not-found-page">
            <span className="eyebrow">404 · AREA NOT FOUND</span>
            <h1>This page isn’t in the archive.</h1>
            <a className="button button-primary" href="/">Return to chat</a>
          </section>
        ),
      },
    ],
  },
])
