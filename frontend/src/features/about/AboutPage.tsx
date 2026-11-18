import { ArrowUpRight, BrainCircuit, Database, GitBranch, Layers3, SearchCheck } from 'lucide-react'

const stages = [
  { n: '01', title: 'Ask', body: 'Your question enters the FastAPI service and the topic guardrail checks that it is about Digimon.', icon: BrainCircuit },
  { n: '02', title: 'Retrieve', body: 'Voyage AI creates an embedding; Qdrant finds up to five relevant knowledge chunks.', icon: SearchCheck },
  { n: '03', title: 'Reason', body: 'Claude Haiku answers using retrieved context. Agent modes can call tools or retry retrieval.', icon: GitBranch },
  { n: '04', title: 'Respond', body: 'The answer streams back with source records, while conversation memory stays in Redis.', icon: Layers3 },
]

export function AboutPage() {
  return (
    <div className="about-page page-container">
      <header className="about-hero">
        <span className="eyebrow">UNDER THE HOOD · SYSTEM NOTES</span>
        <h1>Answers with a<br /><em>trail to follow.</em></h1>
        <p>A retrieval-augmented assistant built to make a focused knowledge base easier to explore—and easier to inspect.</p>
      </header>

      <section className="flow-section" aria-labelledby="flow-heading">
        <div className="section-title"><span className="eyebrow">THE REQUEST PATH</span><h2 id="flow-heading">From question to context.</h2></div>
        <svg className="flow-lines" viewBox="0 0 1000 55" role="img" aria-label="A path connects four request-processing stages">
          <path d="M20 28H980" fill="none" stroke="currentColor" strokeDasharray="4 7" strokeWidth="2" />
          {[125, 375, 625, 875].map((x) => <circle key={x} cx={x} cy="28" r="7" fill="currentColor" />)}
        </svg>
        <div className="flow-grid">
          {stages.map(({ n, title, body, icon: Icon }) => (
            <article key={n} className="flow-card">
              <div><span className="stage-number">{n}</span><Icon size={20} aria-hidden="true" /></div>
              <h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="modes-section" aria-labelledby="modes-heading">
        <div className="section-title"><span className="eyebrow">THREE WAYS TO REASON</span><h2 id="modes-heading">Pick the right brain.</h2></div>
        <div className="mode-cards">
          <article><span className="mode-number">MODE 01</span><h3>Standard RAG</h3><p>Retrieves relevant passages and streams an answer with source citations and multi-turn context.</p><span className="mode-detail">Conversation memory · filters · streaming</span></article>
          <article><span className="mode-number">MODE 02</span><h3>Tool-calling Agent</h3><p>Lets the model choose from Digimon lookup, skills, level, and retrieval tools for a question.</p><span className="mode-detail">Tool calls · no cross-turn memory</span></article>
          <article><span className="mode-number">MODE 03</span><h3>Corrective RAG</h3><p>Grades retrieved context and can rewrite a question before trying retrieval again.</p><span className="mode-detail">Up to two refinements · no memory</span></article>
        </div>
      </section>

      <section className="metrics-section" aria-labelledby="metrics-heading">
        <div className="section-title"><span className="eyebrow">EVALUATION SNAPSHOT</span><h2 id="metrics-heading">Measured, not promised.</h2><p>From the repository README; measured by the author on the default 100-Digimon ingest.</p></div>
        <div className="metric-grid">
          <Metric value="1.000" label="Faithfulness" />
          <Metric value="0.848" label="Answer relevancy" />
          <Metric value="0.883" label="Context precision" />
          <Metric value="1.000" label="Context recall" />
        </div>
      </section>

      <section className="stack-section">
        <div><span className="eyebrow">THE BUILD</span><h2>A small stack, clear boundaries.</h2><p>FastAPI · React · Anthropic Claude · Voyage AI · Qdrant · PostgreSQL · Redis · Langfuse</p></div>
        <Database size={32} aria-hidden="true" />
      </section>
      <footer className="about-footnote">
        <div><span className="eyebrow">DATA & ATTRIBUTION</span><p>Digimon data provided by <a href="https://digi-api.com/" target="_blank" rel="noopener noreferrer">DAPI (digi-api.com) <ArrowUpRight size={13} /></a>.</p></div>
        <div><p>Unofficial fan project. Digimon is a trademark of its respective owners. Not affiliated with Bandai/Toei.</p><a href="https://github.com/Smit-Barasara/knowledge-rag-assistant" target="_blank" rel="noopener noreferrer">View the project on GitHub <ArrowUpRight size={13} /></a></div>
      </footer>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="metric-card"><strong>{value}</strong><span>{label}</span></div>
}
