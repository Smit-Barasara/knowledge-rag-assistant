import { ArrowUpRight, BookOpen } from 'lucide-react'

const stages = [
  { n: '01', title: 'Ask', body: 'A topic guardrail checks that the question concerns Indian rail passenger guidance.' },
  { n: '02', title: 'Retrieve', body: 'Voyage AI creates an embedding; Qdrant finds relevant passages from the curated guidance corpus.' },
  { n: '03', title: 'Reason', body: 'A Groq-hosted model answers using retrieved context. Agent modes can search or retry retrieval.' },
  { n: '04', title: 'Respond', body: 'The answer streams with source references. Conversation memory stays in Redis.' },
]

export function AboutPage() {
  return (
    <div className="about-page page-container">
      <header className="about-hero">
        <span className="eyebrow">UNDER THE HOOD · SYSTEM NOTES</span>
        <h1>Good answers begin<br /><em>with good sources.</em></h1>
        <p>Railwise helps you explore general Indian rail travel guidance, with answers grounded in linked official sources.</p>
      </header>

      <section className="flow-section" aria-labelledby="flow-heading">
        <div className="section-title"><span className="eyebrow">THE REQUEST PATH</span><h2 id="flow-heading">From question to context.</h2></div>
        <div className="flow-grid">
          {stages.map(({ n, title, body }) => (
            <article key={n} className="flow-card">
              <div><span className="stage-number">{n}</span></div>
              <h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="modes-section" aria-labelledby="modes-heading">
        <div className="section-title"><span className="eyebrow">THREE WAYS TO REASON</span><h2 id="modes-heading">Pick the right brain.</h2></div>
        <div className="mode-cards">
          <article><span className="mode-number">MODE 01</span><h3>Standard RAG</h3><p>Retrieves relevant passages and streams an answer with source citations and multi-turn context.</p><span className="mode-detail">Conversation memory · filters · streaming</span></article>
          <article><span className="mode-number">MODE 02</span><h3>Tool-calling Agent</h3><p>Lets the model search rail guidance or open a source record before answering.</p><span className="mode-detail">Source search · no cross-turn memory</span></article>
          <article><span className="mode-number">MODE 03</span><h3>Corrective RAG</h3><p>Grades retrieved context and can rewrite a question before trying retrieval again.</p><span className="mode-detail">Up to two refinements · no memory</span></article>
        </div>
      </section>

      <section className="stack-section">
        <div><span className="eyebrow">THE BUILD</span><h2>A familiar problem, a grounded answer.</h2><p>FastAPI · React · Groq · Voyage AI · Qdrant · PostgreSQL · Redis · Langfuse</p><p>This prototype does not connect to live train schedules, PNR status, seat availability, ticket booking, or personal refund decisions.</p></div>
        <BookOpen size={32} aria-hidden="true" />
      </section>
      <footer className="about-footnote">
        <div><span className="eyebrow">OFFICIAL SOURCES</span><p>Guidance corpus checked 18 November 2026. Individual pages may change; verify before relying on them.</p><a href="https://contents.irctc.co.in/en/eticketCancel.html" target="_blank" rel="noopener noreferrer">IRCTC e-ticket cancellation guide <ArrowUpRight size={16} /></a><br /><a href="https://contents.irctc.co.in/en/TatkalBooking.html" target="_blank" rel="noopener noreferrer">IRCTC Tatkal guide <ArrowUpRight size={16} /></a><br /><a href="https://contents.irctc.co.in/en/bookEticket.html" target="_blank" rel="noopener noreferrer">IRCTC e-ticket guide <ArrowUpRight size={16} /></a></div>
        <div><p>Independent educational project. Not affiliated with Indian Railways or IRCTC. No booking or live-status services.</p><a href="https://github.com/Smit-Barasara/knowledge-rag-assistant" target="_blank" rel="noopener noreferrer">View the project on GitHub <ArrowUpRight size={16} /></a></div>
      </footer>
    </div>
  )
}
