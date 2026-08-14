import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="landing-page">
      <div className="landing-card">
        <div className="brand-line"><span className="brand-dot" /> OpenCut <span className="brand-pill">Composition</span></div>
        <h1>Editor de composición multiclip</h1>
        <p>Dividido, Trío, Spotlight, Grid y collage libre con recorte independiente por video.</p>
        <Link className="primary-button landing-button" to="/editor">Abrir editor</Link>
      </div>
    </main>
  )
}
