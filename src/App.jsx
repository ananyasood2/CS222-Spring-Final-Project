import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Sparkles
} from 'lucide-react';

const DEFAULT_REQUIREMENTS = `Proposal must include:
- Project title
- Abstract
- Motivation and gap
- Project goal
- Method or agent workflow
- Figure or diagram with caption
- Expected results
- Research milestones with timeline estimates
- Evaluation plan
- Baseline, metric, test context, and success threshold
- Related work / novelty comparison
- Figure or diagram prompt
- Risks and mitigation
- Resources or budget
- References, assumptions, or source notes`;

const EMPTY_PROJECT = {
  title: '',
  topic: '',
  problem: '',
  method: '',
  timeline: '',
  evaluation: '',
  successThreshold: '',
  relatedWork: '',
  novelty: '',
  figurePrompt: '',
  resources: '',
  references: '',
  requirements: DEFAULT_REQUIREMENTS
};

const PROJECT_FIELDS = [
  ['problem', 'Problem'],
  ['method', 'Method'],
  ['evaluation', 'Evaluation'],
  ['successThreshold', 'Success Threshold'],
  ['relatedWork', 'Related Paper Abstracts'],
  ['novelty', 'Novelty / Distinct Contribution'],
  ['figurePrompt', 'Figure / Diagram Prompt'],
  ['timeline', 'Timeline'],
  ['resources', 'Resources'],
  ['references', 'Sources']
];

const STAGES = [
  ['1', 'Extract', 'LLM turns the rough idea into structured proposal data'],
  ['2', 'Decide', 'You choose or edit candidate framings'],
  ['3', 'Assemble', 'Accepted fields become project state'],
  ['4', 'Draft', 'LLM writes proposal artifacts'],
  ['5', 'Pre-Mortem', 'Agent predicts rejection risks and generates rescue plan'],
  ['6', 'Revise', 'Student applies fixes, compares diffs, exports transcript']
];

const TABS = [
  ['pdf', FileText, 'PDF'],
  ['latex', FileText, 'LaTeX'],
  ['matrix', ClipboardCheck, 'Matrix'],
  ['evaluation', ListChecks, 'Review'],
  ['premortem', Sparkles, 'Pre-Mortem'],
  ['agents', Sparkles, 'Agents'],
  ['diff', ClipboardCheck, 'Diff'],
  ['transcript', FileText, 'Transcript'],
  ['usage', ListChecks, 'AI Log']
];

const MEMORY_KEY = 'proposal-agent-final-project-memory-v1';

function App() {
  const [topicInput, setTopicInput] = useState('');
  const [project, setProject] = useState(EMPTY_PROJECT);
  const [fieldSuggestions, setFieldSuggestions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [customNote, setCustomNote] = useState('');
  const [result, setResult] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [runLog, setRunLog] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('pdf');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [decisionIndex, setDecisionIndex] = useState(0);
  const [memorySavedAt, setMemorySavedAt] = useState('');
  const [memoryReady, setMemoryReady] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState('skeptical methodologist');
  const [revisionHistory, setRevisionHistory] = useState([]);

  const matrixStats = useMemo(() => {
    const rows = result?.complianceMatrix || [];
    const covered = rows.filter((row) => /^covered$/i.test(row.status)).length;
    return { covered, total: rows.length };
  }, [result]);

  const acceptedCount = PROJECT_FIELDS.filter(([field]) => Boolean(project[field])).length;
  const acceptedSuggestionCount = fieldSuggestions.filter((suggestion) => project[suggestion.field] === suggestion.value).length;
  const currentSuggestion = fieldSuggestions[suggestionIndex] || null;
  const currentDecision = decisions[decisionIndex] || null;
  const currentQuestion = questions[0];

  useEffect(() => {
    loadSavedMemory({ silent: true });
    setMemoryReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!memoryReady) return;

    if (!topicInput && !fieldSuggestions.length && !decisions.length && !result) {
      return;
    }

    saveMemory({ silent: true });
  }, [
    memoryReady,
    topicInput,
    project,
    fieldSuggestions,
    decisions,
    questions,
    result,
    runLog,
    activeTab,
    suggestionIndex,
    decisionIndex,
    selectedPersona,
    revisionHistory
  ]);

  async function startAgent() {
    return startAgentForTopic(topicInput);
  }

  async function startSampleAgent() {
    const sampleTopic = 'Proposal Pre-Mortem Agent: predicting reviewer objections before submission';
    setTopicInput(sampleTopic);
    return startAgentForTopic(sampleTopic);
  }

  async function startAgentForTopic(nextTopic) {
    setStatus('starting');
    setError('');
    clearArtifacts();

    try {
      const data = await postJson('/api/agent/start', {
        topic: nextTopic,
        requirements: DEFAULT_REQUIREMENTS
      });

      setProject({ ...EMPTY_PROJECT, ...data.project });
      setFieldSuggestions(data.fieldSuggestions || []);
      setDecisions(data.decisions || []);
      setQuestions(data.questions || []);
      setSuggestionIndex(0);
      setDecisionIndex(0);
      setRunLog([
        logEntry('Extract', data.runMessage || 'LLM prepared structured suggestions.'),
        logEntry('Decide', `Review ${(data.fieldSuggestions || []).length} fields and ${(data.decisions || []).length} decision card(s).`)
      ]);
      setCustomNote('');
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setStatus('idle');
    }
  }

  async function submitCustomNote() {
    const trimmed = customNote.trim();
    if (!trimmed) return;

    setStatus('answering');
    setError('');

    try {
      const data = await postJson('/api/agent/answer', {
        project,
        question: currentQuestion || {
          field: 'method',
          question: 'Integrate this user note into the project state.',
          reason: 'The user provided a custom refinement.',
          priority: 'Medium'
        },
        answer: trimmed,
        requirements: DEFAULT_REQUIREMENTS
      });

      setProject({ ...EMPTY_PROJECT, ...data.project });
      setFieldSuggestions(data.fieldSuggestions || []);
      setDecisions(data.decisions || []);
      setQuestions(data.questions || []);
      setSuggestionIndex(0);
      setDecisionIndex(0);
      setRunLog((current) => [
        ...current,
        logEntry('Update', data.runMessage || 'Integrated custom note.'),
        logEntry('Decide', `Refreshed ${(data.fieldSuggestions || []).length} suggested field(s).`)
      ]);
      setCustomNote('');
      clearArtifacts();
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setStatus('idle');
    }
  }

  async function generateProposal() {
    setStatus('drafting');
    setError('');
    const previous = result;

    try {
      const data = await postJson('/api/proposal', {
        ...project,
        topic: project.topic || project.title,
        reviewerPersona: selectedPersona,
        requirements: DEFAULT_REQUIREMENTS
      });

      if (previous?.proposalLatex) {
        setRevisionHistory((current) => [
          ...current,
          {
            id: `round-${Date.now()}`,
            createdAt: new Date().toISOString(),
            persona: selectedPersona,
            beforeLatex: previous.proposalLatex,
            afterLatex: data.proposalLatex,
            beforeScores: previous.preMortem?.scores || {},
            afterScores: data.preMortem?.scores || {},
            decisions: runLog.slice(-8)
          }
        ]);
      }

      setResult(data);

      try {
        const nextPdfUrl = await exportPdfUrl(data.proposalLatex, data.project?.title || project.title || 'proposal');
        updatePdfUrl(nextPdfUrl);
      } catch (pdfError) {
        updatePdfUrl('');
        setRunLog((current) => [
          ...current,
          logEntry('PDF', `PDF preview could not render: ${readError(pdfError)}`)
        ]);
      }

      setActiveTab('premortem');
      setRunLog((current) => [
        ...current,
        logEntry('Draft', `Generated proposal using ${data.mode}.`),
        logEntry('Reviewer Persona', `Simulated reviewer: ${selectedPersona}.`),
        logEntry('Pre-Mortem', `Coverage ${countCovered(data.complianceMatrix)}/${data.complianceMatrix?.length || 0}. Pre-mortem analysis complete.`)
      ]);
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setStatus('idle');
    }
  }

  function applyRescuePlanToProject() {
    const fixes = result?.preMortem?.risks?.map((risk) => risk.rescue).filter(Boolean) || [];
    if (!fixes.length) return;

    setProject((current) => ({
      ...current,
      evaluation: mergeText(current.evaluation, `Revision rescue plan:\n${fixes.slice(0, 3).map((fix, index) => `${index + 1}. ${fix}`).join('\n')}`),
      topic: current.topic || current.title || topicInput
    }));
    setRunLog((current) => [...current, logEntry('Rescue Plan', 'Applied the top rescue-plan fixes into the project state. Re-run the pre-mortem to compare scores.')]);
  }

  function exportTranscript() {
    const markdown = buildTranscriptMarkdown({ project, result, runLog, revisionHistory, selectedPersona });
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'proposal-premortem-transcript.md';
    anchor.click();
    URL.revokeObjectURL(href);
    setRunLog((current) => [...current, logEntry('Export', 'Downloaded transcript markdown.')]);
  }

  function acceptSuggestion(suggestion) {
    updateProjectField(suggestion.field, suggestion.value);
    advanceSuggestion();
    setRunLog((current) => [...current, logEntry('Accept', `Accepted ${suggestion.label || suggestion.field}.`)]);
  }

  function skipSuggestion() {
    if (!currentSuggestion) return;
    advanceSuggestion();
    setRunLog((current) => [...current, logEntry('Skip', `Skipped ${currentSuggestion.label || currentSuggestion.field}.`)]);
  }

  function advanceSuggestion() {
    setSuggestionIndex((current) => Math.min(current + 1, Math.max(fieldSuggestions.length - 1, 0)));
  }

  function chooseOption(decision, option) {
    updateProjectField(decision.field, option.value);
    setDecisions((current) => {
      const next = current.filter((item) => item.id !== decision.id);
      setDecisionIndex((index) => Math.min(index, Math.max(next.length - 1, 0)));
      return next;
    });
    setRunLog((current) => [...current, logEntry('Decision', `Selected ${option.label} for ${decision.title}.`)]);
  }

  function skipDecision() {
    if (!currentDecision) return;
    advanceDecision();
    setRunLog((current) => [...current, logEntry('Skip', `Skipped ${currentDecision.title}.`)]);
  }

  function advanceDecision() {
    setDecisionIndex((current) => Math.min(current + 1, Math.max(decisions.length - 1, 0)));
  }

  function updateProjectField(field, value) {
    setProject((current) => ({
      ...current,
      [field]: value,
      topic: current.topic || current.title || topicInput
    }));
    clearArtifacts();
  }

  function clearArtifacts() {
    setResult(null);
    updatePdfUrl('');
  }

  function updatePdfUrl(nextUrl) {
    setPdfUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return nextUrl;
    });
  }

  function reset() {
    setTopicInput('');
    setProject(EMPTY_PROJECT);
    setFieldSuggestions([]);
    setDecisions([]);
    setQuestions([]);
    setCustomNote('');
    clearArtifacts();
    setRunLog([]);
    setError('');
    setActiveTab('pdf');
    setSuggestionIndex(0);
    setDecisionIndex(0);
    setSelectedPersona('skeptical methodologist');
    setRevisionHistory([]);
  }

  function downloadLatex() {
    const proposal = result?.proposalLatex || '';
    const blob = new Blob([proposal], { type: 'text/x-tex;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'proposal.tex';
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function downloadPdf() {
    if (!result?.proposalLatex) return;

    setStatus('exporting');
    setError('');

    try {
      const href = pdfUrl || (await exportPdfUrl(result.proposalLatex, project.title || 'proposal'));
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'proposal.pdf';
      anchor.click();
      if (!pdfUrl) URL.revokeObjectURL(href);
      setRunLog((current) => [...current, logEntry('Export', 'Downloaded proposal.pdf.')]);
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setStatus('idle');
    }
  }

  function saveMemory({ silent = false } = {}) {
    const snapshot = {
      savedAt: new Date().toISOString(),
      topicInput,
      project,
      fieldSuggestions,
      decisions,
      questions,
      result: compactResult(result),
      runLog,
      activeTab,
      suggestionIndex,
      decisionIndex,
      selectedPersona,
      revisionHistory
    };

    localStorage.setItem(MEMORY_KEY, JSON.stringify(snapshot));
    setMemorySavedAt(snapshot.savedAt);

    if (!silent) {
      setRunLog((current) => [...current, logEntry('Memory', 'Saved workspace memory.')]);
    }
  }

  async function loadSavedMemory({ silent = false } = {}) {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) {
      if (!silent) setError('No saved memory found.');
      return;
    }

    try {
      const snapshot = JSON.parse(raw);
      setTopicInput(snapshot.topicInput || '');
      setProject({ ...EMPTY_PROJECT, ...(snapshot.project || {}) });
      setFieldSuggestions(Array.isArray(snapshot.fieldSuggestions) ? snapshot.fieldSuggestions : []);
      setDecisions(Array.isArray(snapshot.decisions) ? snapshot.decisions : []);
      setQuestions(Array.isArray(snapshot.questions) ? snapshot.questions : []);
      setResult(snapshot.result || null);
      setRunLog(Array.isArray(snapshot.runLog) ? snapshot.runLog : []);
      setActiveTab(snapshot.activeTab || 'pdf');
      setSuggestionIndex(Number(snapshot.suggestionIndex || 0));
      setDecisionIndex(Number(snapshot.decisionIndex || 0));
      setSelectedPersona(snapshot.selectedPersona || 'skeptical methodologist');
      setRevisionHistory(Array.isArray(snapshot.revisionHistory) ? snapshot.revisionHistory : []);
      setMemorySavedAt(snapshot.savedAt || '');
      setError('');

      if (snapshot.result?.proposalLatex) {
        try {
          const nextPdfUrl = await exportPdfUrl(
            snapshot.result.proposalLatex,
            snapshot.project?.title || 'proposal'
          );
          updatePdfUrl(nextPdfUrl);
        } catch (pdfError) {
          updatePdfUrl('');
          setRunLog((current) => [
            ...current,
            logEntry('PDF', `PDF preview could not render after reload: ${readError(pdfError)}`)
          ]);
        }
      } else {
        updatePdfUrl('');
      }

      if (!silent) {
        setRunLog((current) => [...current, logEntry('Memory', 'Reloaded saved workspace memory.')]);
      }
    } catch {
      setError('Saved memory is unreadable. Clear it and save again.');
    }
  }

  function clearSavedMemory() {
    localStorage.removeItem(MEMORY_KEY);
    setMemorySavedAt('');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Proposal Pre-Mortem Agent</h1>
        <span className="status-pill">
          <Sparkles size={16} aria-hidden="true" />
          {result?.mode || (fieldSuggestions.length ? 'structuring' : 'ready')}
        </span>
      </header>

      <section className="workspace single-pane">
        <section className="workflow-artifact">
          <div className="topic-launch">
            <label htmlFor="project-topic">
              Rough Idea
              <input
                id="project-topic"
                value={topicInput}
                onChange={(event) => setTopicInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') startAgent();
                }}
                placeholder="Example: Agent that predicts reviewer objections before proposal submission"
              />
            </label>
            <div className="actions framework-actions">
              <button className="primary" disabled={!topicInput.trim() || status !== 'idle'} onClick={startAgent} type="button">
                {status === 'starting' ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                Structure Idea
              </button>
              <button className="secondary" disabled={status !== 'idle'} onClick={startSampleAgent} type="button">
                <Sparkles size={18} aria-hidden="true" />
                Sample
              </button>
              <button className="secondary icon-button" onClick={reset} type="button" aria-label="Reset">
                <RefreshCw size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="memory-bar">
            <div>
              <strong>Memory</strong>
              <span>{memorySavedAt ? `Saved ${formatSavedAt(memorySavedAt)}` : 'No saved workspace yet'}</span>
            </div>
            <div className="memory-actions">
              <button className="secondary" type="button" onClick={() => saveMemory()}>
                Save
              </button>
              <button className="secondary" type="button" onClick={() => loadSavedMemory()}>
                Reload
              </button>
              <button className="secondary" type="button" onClick={clearSavedMemory}>
                Clear
              </button>
            </div>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="workflow-grid" aria-label="Workflow stages">
            {STAGES.map(([number, title, description], index) => (
              <article className="stage-card" key={title}>
                <div className="stage-topline">
                  <span className="stage-number">{number}</span>
                  <span className={`stage-status ${stageStatus(index, fieldSuggestions, decisions, project, result)}`}>
                    {stageLabel(index, fieldSuggestions, decisions, project, result)}
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>

          <div className="workspace-grid">
            <section className="workspace-panel suggestions-panel">
              <PanelHeader title="LLM Suggested Structure" meta={`${fieldSuggestions.length} fields`} />
              {fieldSuggestions.length ? (
                <div className="suggestion-deck">
                  <div className="deck-progress">
                    <span>{Math.min(suggestionIndex + 1, fieldSuggestions.length)} / {fieldSuggestions.length}</span>
                    <strong>{acceptedSuggestionCount} accepted</strong>
                  </div>
                  {currentSuggestion ? (
                    <article className="suggestion-card active-card" key={`${currentSuggestion.field}-${currentSuggestion.value}`}>
                      <div className="card-line">
                        <h3>{currentSuggestion.label || labelForField(currentSuggestion.field)}</h3>
                        <span className={`priority ${String(currentSuggestion.confidence || 'medium').toLowerCase()}`}>
                          {currentSuggestion.confidence || 'Medium'}
                        </span>
                      </div>
                      <p>{currentSuggestion.value}</p>
                      <small>{currentSuggestion.reason}</small>
                      <div className="deck-actions">
                        <button
                          className={project[currentSuggestion.field] === currentSuggestion.value ? 'secondary accepted' : 'primary'}
                          type="button"
                          onClick={() => acceptSuggestion(currentSuggestion)}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                          {project[currentSuggestion.field] === currentSuggestion.value ? 'Accepted' : 'Accept and Next'}
                        </button>
                        <button className="secondary" type="button" onClick={skipSuggestion}>
                          Skip
                        </button>
                      </div>
                    </article>
                  ) : null}
                  <div className="deck-nav">
                    <button
                      className="secondary"
                      type="button"
                      disabled={suggestionIndex === 0}
                      onClick={() => setSuggestionIndex((current) => Math.max(current - 1, 0))}
                    >
                      Previous
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={suggestionIndex >= fieldSuggestions.length - 1}
                      onClick={() => setSuggestionIndex((current) => Math.min(current + 1, fieldSuggestions.length - 1))}
                    >
                      Next
                    </button>
                  </div>
                  <div className="deck-strip" aria-label="Suggestion progress">
                    {fieldSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.field}-${index}`}
                        className={[
                          'deck-dot',
                          index === suggestionIndex ? 'current' : '',
                          project[suggestion.field] === suggestion.value ? 'done' : ''
                        ].join(' ')}
                        type="button"
                        aria-label={`Open ${suggestion.label || labelForField(suggestion.field)}`}
                        onClick={() => setSuggestionIndex(index)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState text="Enter a rough idea, then let the model structure it." compact />
              )}
            </section>

            <section className="workspace-panel decisions-panel">
              <PanelHeader title="Decision Needed" meta={`${decisions.length} open`} />
              {decisions.length ? (
                <div className="decision-deck">
                  <div className="deck-progress">
                    <span>{Math.min(decisionIndex + 1, decisions.length)} / {decisions.length}</span>
                    <strong>{decisions.length} open</strong>
                  </div>
                  {currentDecision ? (
                    <article className="decision-card active-card" key={currentDecision.id}>
                      <h3>{currentDecision.title}</h3>
                      <p>{currentDecision.question}</p>
                      <div className="option-stack">
                        {currentDecision.options.map((option) => (
                          <button
                            className="option-button"
                            key={`${currentDecision.id}-${option.label}`}
                            type="button"
                            onClick={() => chooseOption(currentDecision, option)}
                          >
                            <strong>{option.label}</strong>
                            <span>{option.value}</span>
                            <small>{option.rationale}</small>
                          </button>
                        ))}
                      </div>
                      <div className="deck-actions">
                        <button className="secondary" type="button" onClick={skipDecision}>
                          Skip
                        </button>
                      </div>
                    </article>
                  ) : null}
                  <div className="deck-nav">
                    <button
                      className="secondary"
                      type="button"
                      disabled={decisionIndex === 0}
                      onClick={() => setDecisionIndex((current) => Math.max(current - 1, 0))}
                    >
                      Previous
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={decisionIndex >= decisions.length - 1}
                      onClick={() => setDecisionIndex((current) => Math.min(current + 1, decisions.length - 1))}
                    >
                      Next
                    </button>
                  </div>
                  <div className="deck-strip" aria-label="Decision progress">
                    {decisions.map((decision, index) => (
                      <button
                        key={`${decision.id}-${index}`}
                        className={['deck-dot', index === decisionIndex ? 'current' : ''].join(' ')}
                        type="button"
                        aria-label={`Open ${decision.title}`}
                        onClick={() => setDecisionIndex(index)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState text="No major decision is open. Review the accepted state or draft the proposal." compact />
              )}

              <section className="custom-note">
                <h3>Extra Note</h3>
                <textarea
                  value={customNote}
                  onChange={(event) => setCustomNote(event.target.value)}
                  placeholder={currentQuestion?.question || 'Add a detail the options missed.'}
                />
                <button className="primary" disabled={!customNote.trim() || status !== 'idle'} onClick={submitCustomNote} type="button">
                  {status === 'answering' ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                  Let LLM Integrate
                </button>
              </section>
            </section>

            <section className="workspace-panel state-panel">
              <PanelHeader title="Accepted Project State" meta={`${acceptedCount}/${PROJECT_FIELDS.length} ready`} />
              <label>
                Project Title
                <input value={project.title} onChange={(event) => updateProjectField('title', event.target.value)} />
              </label>
              {PROJECT_FIELDS.map(([field, label]) => (
                <label key={field}>
                  {label}
                  <textarea value={project[field] || ''} onChange={(event) => updateProjectField(field, event.target.value)} />
                </label>
              ))}
              <label>
                Reviewer Persona
                <select value={selectedPersona} onChange={(event) => setSelectedPersona(event.target.value)}>
                  <option value="skeptical methodologist">Skeptical methodologist</option>
                  <option value="domain expert">Domain expert</option>
                  <option value="funding officer">Funding officer</option>
                </select>
              </label>
              <div className="stacked-actions">
                <button className="primary" disabled={!project.title || status !== 'idle'} onClick={generateProposal} type="button">
                  {status === 'drafting' ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                  {result ? 'Re-run Pre-Mortem' : 'Generate + Run Pre-Mortem'}
                </button>
                <button className="secondary" disabled={!result?.preMortem?.risks?.length || status !== 'idle'} onClick={applyRescuePlanToProject} type="button">
                  Apply Top Rescue Plan
                </button>
              </div>
            </section>
          </div>

          <div className="artifact-workspace">
            <section className="workflow-panel run-log-top">
              <div className="run-log-header">
                <h2>Run Log</h2>
                <span>{runLog.length} events</span>
              </div>

              {runLog.length ? (
                <ol className="run-log run-log-horizontal">
                  {runLog.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.stage}</span>
                      <p>{entry.message}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState text="Run log appears after the idea is structured." compact />
              )}
            </section>

            <section className="workflow-panel artifacts-panel">
              <div className="artifact-toolbar">
                <nav className="tabs" aria-label="Generated artifacts">
                  {TABS.map(([id, Icon, label]) => (
                    <button
                      key={id}
                      className={activeTab === id ? 'tab active' : 'tab'}
                      type="button"
                      onClick={() => setActiveTab(id)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </nav>
                <button className="secondary" type="button" disabled={!result?.proposalLatex} onClick={downloadLatex}>
                  <Download size={17} aria-hidden="true" />
                  LaTeX
                </button>
                <button className="secondary" type="button" disabled={!result} onClick={exportTranscript}>
                  <Download size={17} aria-hidden="true" />
                  Transcript
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={!result?.proposalLatex || status !== 'idle'}
                  onClick={downloadPdf}
                >
                  {status === 'exporting' ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
                  PDF
                </button>
              </div>

              <div className="artifact-summary">
                <div>
                  <span>Coverage</span>
                  <strong>{matrixStats.total ? `${matrixStats.covered}/${matrixStats.total}` : '0/0'}</strong>
                </div>
                <div>
                  <span>Accepted</span>
                  <strong>{acceptedCount}/{PROJECT_FIELDS.length}</strong>
                </div>
                <div>
                  <span>Provider</span>
                  <strong>{result?.provider || 'waiting'}</strong>
                </div>
                <div>
                  <span>Rounds</span>
                  <strong>{revisionHistory.length + (result ? 1 : 0)}</strong>
                </div>
              </div>

              {renderArtifact(activeTab, result, pdfUrl, project, revisionHistory, runLog, selectedPersona)}
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.error || 'Request failed.');
  }

  return data;
}

async function exportPdfUrl(proposalLatex, title) {
  const response = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      proposalLatex
    })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || data.error || 'PDF export failed.');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function renderArtifact(activeTab, result, pdfUrl, project, revisionHistory, runLog, selectedPersona) {
  if (!result) {
    return <EmptyState text="Proposal artifacts appear after Generate + Run Pre-Mortem." />;
  }

  if (activeTab === 'agents') {
    const risks = result.preMortem?.risks || [];
    const assumptions = result.preMortem?.assumptions || [];
    const topRisk = risks[0];
    const writerClaim = extractProposalClaim(result.proposalLatex, project);
  
    return (
      <div className="analysis-stack">
        <section className="analysis-card">
          <h3>Multi-Agent Mode: Writer vs. Critic</h3>
          <p>
            This mode separates the workflow into a Writer Agent that proposes the draft
            and a Critic Agent that attacks it from the selected reviewer perspective.
          </p>
        </section>
  
        <section className="agent-debate-grid">
          <article className="agent-card writer-agent">
            <span className="eyebrow">Writer Agent</span>
            <h3>Proposal Builder</h3>
            <p>{writerClaim}</p>
            <small>
              Goal: create a complete proposal with method, evaluation, timeline, and source notes.
            </small>
          </article>
  
          <article className="agent-card critic-agent">
            <span className="eyebrow">Critic Agent</span>
            <h3>{formatPersonaName(selectedPersona || 'reviewer critic')}</h3>
            <p>
              {topRisk
                ? topRisk.objection
                : 'No critic objection was returned yet. Re-run the pre-mortem to generate reviewer attacks.'}
            </p>
            <small>
              Goal: find rejection risks before the proposal is submitted.
            </small>
          </article>
  
          <article className="agent-card student-agent">
            <span className="eyebrow">Student Decision</span>
            <h3>Revise or Reject</h3>
            <p>
              The student decides whether to accept the rescue plan, edit it, or reject it.
              The revised draft can then be re-scored.
            </p>
            <small>
              Goal: keep the human in control of the final revision.
            </small>
          </article>
        </section>
  
        <section className="analysis-card">
          <h3>Writer vs. Critic Debate</h3>
          <div className="debate-stack">
            {risks.slice(0, 4).map((risk, index) => (
              <article className="debate-turn" key={`${risk.title}-${index}`}>
                <div className="speaker writer">Writer Agent</div>
                <p>
                  The proposal currently claims this project is feasible and useful for improving proposal quality.
                </p>
  
                <div className="speaker critic">Critic Agent</div>
                <p>
                  <strong>{risk.title}:</strong> {risk.objection}
                </p>
  
                <div className="speaker student">Revision Decision</div>
                <p>
                  <strong>Rescue plan:</strong> {risk.rescue}
                </p>
              </article>
            ))}
  
            {!risks.length ? (
              <p>No debate available yet. Generate or re-run the pre-mortem first.</p>
            ) : null}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Critic Evidence</h3>
          <div className="mini-grid">
            <div className="check-card missing">
              <strong>Reviewer objections</strong>
              <span>{risks.length}</span>
              <p>Objections generated by the critic agent.</p>
            </div>
            <div className="check-card missing">
              <strong>Assumptions flagged</strong>
              <span>{assumptions.length}</span>
              <p>Unsupported claims identified by the critic agent.</p>
            </div>
            <div className="check-card ok">
              <strong>Human decision loop</strong>
              <span>Active</span>
              <p>Student can apply a rescue plan and re-run the pre-mortem.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === 'pdf') {
    return pdfUrl ? (
      <iframe className="pdf-preview" src={pdfUrl} title="Compiled proposal PDF" />
    ) : (
      <EmptyState text="PDF preview is rendering." />
    );
  }

  if (activeTab === 'matrix') {
    return (
      <div className="matrix-wrap">
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            {(result.complianceMatrix || []).map((row, index) => (
              <tr key={`${row.requirement}-${index}`}>
                <td>{row.requirement}</td>
                <td>
                  <span className={/^covered$/i.test(row.status) ? 'badge covered' : 'badge needs-work'}>{row.status}</span>
                </td>
                <td>{row.evidence}</td>
                <td>{row.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (activeTab === 'evaluation') {
    const checks = validateEvaluationPlan(project.evaluation, project.successThreshold);
    const hedges = findHedges(result.proposalLatex);
    return (
      <div className="analysis-stack">
        <section className="analysis-card">
          <h3>Evaluation Plan Validator</h3>
          <div className="mini-grid">
            {checks.map((check) => (
              <div className={check.ok ? 'check-card ok' : 'check-card missing'} key={check.label}>
                <strong>{check.label}</strong>
                <span>{check.ok ? 'Found' : 'Missing'}</span>
                <p>{check.hint}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="analysis-card">
          <h3>Tone and Confidence Analyzer</h3>
          {hedges.length ? (
            <ul className="plain-list">
              {hedges.slice(0, 8).map((item, index) => (
                <li key={`${item.word}-${index}`}>
                  <strong>{item.word}</strong>: replace or support this phrase if it makes a claim sound uncertain.
                </li>
              ))}
            </ul>
          ) : (
            <p>No major hedge words detected in the generated draft.</p>
          )}
        </section>
        <pre>{result.evaluationReport}</pre>
      </div>
    );
  }

  if (activeTab === 'premortem') {
    const pm = result.preMortem;
    if (!pm) return <EmptyState text="No pre-mortem data returned. Regenerate the proposal with an API key configured." />;
  
    const scores = pm.scores || {};
    const scoreEntries = Object.entries(scores);
    const avg = scoreEntries.length
      ? (scoreEntries.reduce((sum, [, v]) => sum + Number(v || 0), 0) / scoreEntries.length).toFixed(1)
      : '—';
  
    const coreScoreKeys = ['novelty', 'clarity', 'feasibility', 'evaluation_rigor'];
    const personaRows = buildPersonaObjections(pm, project);
    const gapChecks = buildGapSpecificityChecks(project, result);
    const gapScore = Number(scores.gap_specificity || 0);
  
    return (
      <div className="premortem-panel">
        <section className="analysis-card">
          <h3>Core Analysis Checklist</h3>
          <div className="mini-grid">
            <div className="check-card ok">
              <strong>Rejection Risk Scoring</strong>
              <span>Active</span>
              <p>Scores proposal risk from 0–10 on novelty, clarity, feasibility, and evaluation rigor.</p>
            </div>
            <div className="check-card ok">
              <strong>Reviewer Persona Simulation</strong>
              <span>Active</span>
              <p>Skeptical methodologist, domain expert, and funding officer objections are shown below.</p>
            </div>
            <div className="check-card ok">
              <strong>Assumption Auditor</strong>
              <span>Active</span>
              <p>Unsupported claims are flagged with a suggested action: cite, soften, or remove.</p>
            </div>
            <div className="check-card ok">
              <strong>Gap Specificity Checker</strong>
              <span>Active</span>
              <p>Checks whether the proposal clearly names what has not been done yet.</p>
            </div>
          </div>
        </section>
  
        <section className="analysis-card score-card">
          <div>
            <span className="eyebrow">Rejection Risk Score</span>
            <strong className="big-score">{avg}<small>/10</small></strong>
            <p>
            Each score is rated from 0–10. Higher scores mean stronger sections;
            lower scores show where the proposal is more likely to be rejected.
            </p>
          </div>
          <ScoreBars scores={scores} />
        </section>
  
        <section className="analysis-card">
          <h3>Required Risk Dimensions</h3>
          <div className="mini-grid">
            {coreScoreKeys.map((key) => {
              const value = Number(scores[key] || 0);
              return (
                <div className={value >= 7 ? 'check-card ok' : 'check-card missing'} key={key}>
                  <strong>{key.replace(/_/g, ' ')}</strong>
                  <span>{value}/10</span>
                  <p>
                    {value >= 7
                      ? 'This area looks relatively strong.'
                      : 'This area needs revision before submission.'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Reviewer Persona Simulation</h3>
          <p>
            These objections simulate how different reviewers would attack the same proposal.
          </p>
          <div className="persona-grid">
            {personaRows.map((row) => (
              <article key={row.persona}>
                <strong>{row.persona}</strong>
                <p>{row.objection}</p>
              </article>
            ))}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Gap Specificity Checker</h3>
          <p>
            Gap specificity score: <strong>{gapScore}/10</strong>. This checks whether the proposal clearly explains
            what existing tools or papers do not already solve.
          </p>
          <div className="mini-grid">
            {gapChecks.map((check) => (
              <div className={check.ok ? 'check-card ok' : 'check-card missing'} key={check.label}>
                <strong>{check.label}</strong>
                <span>{check.ok ? 'Found' : 'Missing'}</span>
                <p>{check.hint}</p>
              </div>
            ))}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Assumption Auditor</h3>
          <p>
            These are claims that need evidence, softer wording, or removal.
          </p>
          <div className="assumption-stack">
            {(pm.assumptions || []).length ? (
              pm.assumptions.map((assumption, index) => (
                <article key={`${assumption.claim}-${index}`}>
                  <strong>Claim:</strong> {assumption.claim}
                  <p><strong>Action:</strong> {assumption.action}</p>
                </article>
              ))
            ) : (
              <article>
                <strong>No assumptions returned.</strong>
                <p>Re-run the pre-mortem or tighten the API prompt if this section is empty.</p>
              </article>
            )}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Reviewer Objections + Rescue Plans</h3>
          <div className="risk-stack">
            {(pm.risks || []).map((risk, index) => (
              <article className={`risk-card ${String(risk.severity || 'medium').toLowerCase()}`} key={`${risk.title}-${index}`}>
                <div className="risk-topline">
                  <span>{risk.severity || 'medium'}</span>
                  <strong>{risk.title}</strong>
                </div>
                <p>{risk.objection}</p>
                <div className="rescue-box"><b>Rescue plan:</b> {risk.rescue}</div>
              </article>
            ))}
          </div>
        </section>
  
        <section className="analysis-card">
          <h3>Fix These First</h3>
          <ol className="priority-list">
            {(pm.weaknessPriority || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ol>
        </section>
      </div>
    );
  }

  if (activeTab === 'diff') {
    const latest = revisionHistory[revisionHistory.length - 1];
    if (!latest) {
      return <EmptyState text="Diff appears after you re-run the pre-mortem following a revision." />;
    }

    return (
      <div className="analysis-stack">
        <section className="analysis-card">
          <h3>Before / After Score Change</h3>
          <div className="mini-grid">
            {Object.keys({ ...latest.beforeScores, ...latest.afterScores }).map((key) => {
              const before = Number(latest.beforeScores?.[key] || 0);
              const after = Number(latest.afterScores?.[key] || 0);
              return (
                <div className="check-card" key={key}>
                  <strong>{key.replace(/_/g, ' ')}</strong>
                  <span>{before} → {after}</span>
                  <p>{after >= before ? 'Improved or held steady.' : 'Needs more revision.'}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="analysis-card">
          <h3>Before / After Diff View</h3>
          <div className="diff-view">
          {buildLineDiff(latest.beforeLatex, latest.afterLatex)
            .filter((line) => isMeaningfulDiffLine(line.text))
            .slice(0, 80)
            .map((line, index) => (
              <pre className={`diff-line ${line.type}`} key={`${line.text}-${index}`}>
                {line.prefix} {line.text}
              </pre>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === 'transcript') {
    return <pre>{buildTranscriptMarkdown({ project, result, runLog, revisionHistory, selectedPersona: 'saved persona in run log' })}</pre>;
  }

  if (activeTab === 'usage') {
    return (
      <div className="analysis-stack">
        <section className="analysis-card">
          <h3>AI Usage Logger</h3>
          <p>Every model-backed generation stores the prompt payload and raw response. Local fallback mode records that no API call was made.</p>
        </section>
        <section className="analysis-card">
          <h3>Prompt Sent</h3>
          <pre>{JSON.stringify(result.transcript?.prompt || {}, null, 2)}</pre>
        </section>
        <section className="analysis-card">
          <h3>Raw Model / Fallback Response</h3>
          <pre>{result.transcript?.rawResponse || 'No transcript returned.'}</pre>
        </section>
      </div>
    );
  }

  return <pre className="proposal-output">{result.proposalLatex}</pre>;
}

function ScoreBars({ scores }) {
  const entries = Object.entries(scores || {});
  if (!entries.length) return null;

  return (
    <div className="score-bars">
      {entries.map(([key, value]) => {
        const score = Number(value || 0);
        return (
          <div className="score-row" key={key}>
            <div className="score-row-top">
              <span>{key.replace(/_/g, ' ')}</span>
              <strong>{score}/10</strong>
            </div>
            <div className="score-track">
              <div className="score-fill" style={{ width: `${Math.max(0, Math.min(score, 10)) * 10}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isMeaningfulDiffLine(text) {
  const line = String(text || '').trim();

  if (!line) return false;
  if (/^\\(documentclass|usepackage|begin|end|maketitle|author|date|setlist|centering|item)\b/.test(line)) return false;
  if (/^\\(title|caption|textbf|node)\b/.test(line)) return false;
  if (/^\{?\}?$/.test(line)) return false;
  if (/^\\section\{/.test(line)) return false;

  return line.length > 45;
}

function PanelHeader({ title, meta }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function EmptyState({ text, compact = false }) {
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state'}>
      <FileText size={compact ? 24 : 32} aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function stageStatus(index, fieldSuggestions, decisions, project, result) {
  if (index === 0 && fieldSuggestions.length) return 'status-complete';
  if (index === 1 && decisions.length) return 'status-complete';
  if (index === 2 && PROJECT_FIELDS.some(([field]) => project[field])) return 'status-complete';
  if (index >= 3 && result) return 'status-complete';
  return 'status-waiting';
}

function stageLabel(index, fieldSuggestions, decisions, project, result) {
  if (index === 0 && fieldSuggestions.length) return 'Shown';
  if (index === 1 && decisions.length) return 'Shown';
  if (index === 2 && PROJECT_FIELDS.some(([field]) => project[field])) return 'Shown';
  if (index >= 3 && result) return 'Shown';
  return 'Ready';
}

function countCovered(rows = []) {
  return rows.filter((row) => /^covered$/i.test(row.status)).length;
}

function labelForField(field) {
  const found = PROJECT_FIELDS.find(([key]) => key === field);
  return found?.[1] || 'Field';
}

function logEntry(stage, message) {
  return {
    id: `${stage}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    stage,
    message
  };
}

function readError(error) {
  return error instanceof Error ? error.message : String(error);
}

function compactResult(result) {
  if (!result) return null;

  return {
    mode: result.mode,
    provider: result.provider,
    proposalLatex: result.proposalLatex,
    complianceMatrix: result.complianceMatrix,
    evaluationReport: result.evaluationReport,
    preMortem: result.preMortem,
    transcript: result.transcript,
    questions: result.questions
  };
}

function formatSavedAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function mergeText(current, addition) {
  const base = String(current || '').trim();
  const next = String(addition || '').trim();
  if (!base) return next;
  if (!next || base.includes(next)) return base;
  return `${base}\n\n${next}`;
}

function validateEvaluationPlan(evaluation, successThreshold) {
  const text = `${evaluation || ''} ${successThreshold || ''}`.toLowerCase();
  return [
    {
      label: 'Baseline',
      ok: /baseline|compare|against|control|first draft|before/.test(text),
      hint: 'Name what the revised proposal is compared against.'
    },
    {
      label: 'Metric',
      ok: /metric|score|rubric|coverage|specificity|precision|recall|rating/.test(text),
      hint: 'Define the number or rubric used to judge improvement.'
    },
    {
      label: 'Test Context',
      ok: /test|scenario|case|draft|proposal|student|sample/.test(text),
      hint: 'Say where the evaluation happens and what inputs are tested.'
    },
    {
      label: 'Success Threshold',
      ok: /threshold|success|at least|increase|improve|\d+%|\d+\/10/.test(text),
      hint: 'State what result counts as good enough.'
    }
  ];
}

function findHedges(text) {
  const hedgeWords = ['might', 'could possibly', 'we hope', 'may', 'maybe', 'potentially', 'possibly', 'seems'];
  const lower = String(text || '').toLowerCase();
  return hedgeWords
    .filter((word) => lower.includes(word))
    .map((word) => ({ word }));
}

function buildPersonaObjections(pm, project) {
  const risks = pm.risks || [];
  const fallback = risks[0]?.objection || 'The proposal needs more concrete evidence before a reviewer would trust the claim.';
  return [
    {
      persona: 'Skeptical methodologist',
      objection: risks.find((risk) => /baseline|metric|evaluation|method/i.test(`${risk.title} ${risk.objection}`))?.objection || fallback
    },
    {
      persona: 'Domain expert',
      objection: project?.novelty || risks.find((risk) => /gap|novel|prior|related/i.test(`${risk.title} ${risk.objection}`))?.objection || 'The proposal should prove how it is distinct from related work.'
    },
    {
      persona: 'Funding officer',
      objection: risks.find((risk) => /impact|feasible|timeline|scope/i.test(`${risk.title} ${risk.objection}`))?.objection || 'The proposal should show why the work matters and why the timeline is realistic.'
    }
  ];
}

function extractProposalClaim(proposalLatex, project) {
  const text = String(proposalLatex || '')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > 180) {
    return `${text.slice(0, 180)}...`;
  }

  return (
    text ||
    project.problem ||
    'The writer agent generated a proposal draft from the accepted project state.'
  );
}

function buildGapSpecificityChecks(project, result) {
  const text = [
    project?.problem,
    project?.novelty,
    project?.relatedWork,
    result?.proposalLatex
  ].join(' ').toLowerCase();

  return [
    {
      label: 'Names the gap',
      ok: /gap|missing|lack|has not|not yet|unaddressed|falls short/.test(text),
      hint: 'State exactly what current proposal tools or AI writing tools do not solve.'
    },
    {
      label: 'Mentions related work or prior tools',
      ok: /related work|prior|existing|paper|study|tool|system|writing assistant|llm/.test(text),
      hint: 'Point to the closest existing work, tool, paper, or approach.'
    },
    {
      label: 'Explains what is different',
      ok: /unlike|distinct|different|instead|contribution|novel|compared/.test(text),
      hint: 'Explain how this agent is different from a normal draft generator.'
    },
    {
      label: 'Connects gap to evaluation',
      ok: /baseline|metric|score|evaluate|evaluation|threshold|compare/.test(text),
      hint: 'Show how the gap will be tested or measured.'
    }
  ];
}

function formatPersonaName(value) {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function buildLineDiff(before, after) {
  const beforeLines = String(before || '').split('\n');
  const afterLines = String(after || '').split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);
  const rows = [];

  for (let index = 0; index < max; index += 1) {
    const oldLine = beforeLines[index] || '';
    const newLine = afterLines[index] || '';
    if (oldLine === newLine) {
      rows.push({ type: 'same', prefix: ' ', text: oldLine });
    } else {
      if (oldLine) rows.push({ type: 'removed', prefix: '-', text: oldLine });
      if (newLine) rows.push({ type: 'added', prefix: '+', text: newLine });
    }
  }

  return rows;
}

function buildTranscriptMarkdown({ project, result, runLog, revisionHistory, selectedPersona }) {
  const scores = result?.preMortem?.scores || {};
  return `# Proposal Pre-Mortem Agent Transcript

## Project State
- Title: ${project?.title || 'Untitled'}
- Persona: ${selectedPersona || 'Not recorded'}
- Problem: ${project?.problem || 'Missing'}
- Method: ${project?.method || 'Missing'}
- Evaluation: ${project?.evaluation || 'Missing'}
- Novelty: ${project?.novelty || 'Missing'}
- Figure prompt: ${project?.figurePrompt || 'Missing'}

## Run Log
${(runLog || []).map((entry) => `- **${entry.stage}:** ${entry.message}`).join('\n') || '- No run log yet.'}

## Latest Scores
${Object.entries(scores).map(([key, value]) => `- ${key}: ${value}/10`).join('\n') || '- No scores yet.'}

## Weakness Priority
${(result?.preMortem?.weaknessPriority || []).map((item) => `- ${item}`).join('\n') || '- No priority list yet.'}

## Rescue Plans
${(result?.preMortem?.risks || []).map((risk) => `- **${risk.title} (${risk.severity}):** ${risk.rescue}`).join('\n') || '- No rescue plans yet.'}

## Revision History
${(revisionHistory || []).map((round, index) => `- Round ${index + 1}: ${round.persona || 'persona not recorded'} on ${formatSavedAt(round.createdAt)}`).join('\n') || '- No re-run history yet.'}

## AI Usage Log
Mode: ${result?.mode || 'not generated'}
Provider: ${result?.provider || 'not generated'}

### Prompt Payload
\`\`\`json
${JSON.stringify(result?.transcript?.prompt || {}, null, 2)}
\`\`\`

### Raw Response / Fallback Note
\`\`\`
${result?.transcript?.rawResponse || 'No raw response returned.'}
\`\`\`
`;
}

export default App;