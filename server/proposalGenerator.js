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

const EMPTY_PROJECT_FOR_SERVER = {
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
  reviewerPersona: '',
  requirements: DEFAULT_REQUIREMENTS
};

const SYSTEM_PROMPT = `You are a research proposal pre-mortem agent for a CS research proposal.

Use the selected reviewer persona when provided. Imagine this proposal was submitted and REJECTED. Work backward to find the most likely reasons why.

Return strict JSON with this shape:
{
  "proposalLatex": "complete, compile-ready LaTeX source for proposal.tex",
  "complianceMatrix": [
    {
      "requirement": "requirement text",
      "status": "Covered | Needs work",
      "evidence": "short evidence",
      "fix": "short next action"
    }
  ],
  "evaluationReport": "plain text or Markdown report with missing items, weak claims, timeline risks, and revision priorities",
  "preMortem": {
    "scores": {
      "novelty": 0,
      "clarity": 0,
      "feasibility": 0,
      "evaluation_rigor": 0,
      "gap_specificity": 0,
      "method_concreteness": 0
    },
    "risks": [
      {
        "severity": "high | medium | low",
        "title": "short title",
        "objection": "1-2 sentence reviewer objection",
        "rescue": "1-2 sentence concrete fix the student should make"
      }
    ],
    "assumptions": [
      {
        "claim": "the unsupported claim found in the proposal",
        "action": "what to do: cite X, soften to Y, or remove"
      }
    ],
    "weaknessPriority": ["ordered list of the top 3 things to fix first"]
  },
  "questions": ["short clarifying question"]
}

Rules:
- The proposal artifact must be LaTeX, not Markdown.
- Return a complete LaTeX document with \\documentclass[11pt]{article}, 1-inch margins, title, sections, and bibliography/source notes.
- Use compile-safe LaTeX. Avoid minted, shell-escape, external images, custom fonts, or packages that require extra system tools.
- Do not use \\includegraphics or reference external image files. Build figures directly in LaTeX with text boxes, minipages, tabular layouts, lists, or simple arrows.
- Do not use TikZ, pgf, tikzpicture, arrows.meta, node diagrams, or \\draw commands. Build diagrams only with tabular, minipage, fbox, text arrows, and itemized lists.
- Build figures directly in LaTeX with tabular, minipage, fbox, text arrows, and itemized lists only.
- Write the final artifact as a research proposal, not as a short course implementation report.
- Keep the proposed research plan credible, appropriately scoped, and supported by milestones, resources, risks, and evaluation criteria.
- Mark unsupported claims as assumptions.
- Include a concrete agent workflow when the method involves an agent.
- Include at least one LaTeX-native figure, diagram, workflow chart, or architecture sketch with a caption.
- Do not invent citations. Use source notes or assumptions when sources are missing.
- For the preMortem scores, rate each dimension 0-10 where 10 is strongest. Include persona-specific objections that match the selected reviewer persona if one is provided. Be harsh and specific.
- Do not invent citations. Use source notes or assumptions when sources are missing.
- For the preMortem scores, rate each dimension 0-10 where 10 is strongest. Include persona-specific objections that match the selected reviewer persona if one is provided. Be harsh and specific.
- The "preMortem" object is mandatory. Never omit it.
- The "preMortem.scores" object must include numeric 0-10 scores for novelty, clarity, feasibility, evaluation_rigor, gap_specificity, and method_concreteness.
- The "preMortem.risks" array must include at least 3 reviewer objections with severity, title, objection, and rescue.
- The "preMortem.assumptions" array must include at least 2 unsupported claims with actions.
- The "preMortem.weaknessPriority" array must include exactly 3 top revision priorities.
- If any field is uncertain, still return the field and mark uncertainty inside the text. Do not omit required keys.
- Include 3-5 risks and 2-4 assumptions in the preMortem.`;

const PROPOSAL_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['proposalLatex', 'complianceMatrix', 'evaluationReport', 'preMortem', 'questions'],
  properties: {
    proposalLatex: { type: 'string' },
    complianceMatrix: {
      type: 'array',
      items: {
        type: 'object',
        required: ['requirement', 'status', 'evidence', 'fix'],
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' }
        }
      }
    },
    evaluationReport: { type: 'string' },
    preMortem: {
      type: 'object',
      required: ['scores', 'risks', 'assumptions', 'weaknessPriority'],
      properties: {
        scores: {
          type: 'object',
          required: ['novelty', 'clarity', 'feasibility', 'evaluation_rigor', 'gap_specificity', 'method_concreteness'],
          properties: {
            novelty: { type: 'number' },
            clarity: { type: 'number' },
            feasibility: { type: 'number' },
            evaluation_rigor: { type: 'number' },
            gap_specificity: { type: 'number' },
            method_concreteness: { type: 'number' }
          }
        },
        risks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['severity', 'title', 'objection', 'rescue'],
            properties: {
              severity: { type: 'string' },
              title: { type: 'string' },
              objection: { type: 'string' },
              rescue: { type: 'string' }
            }
          }
        },
        assumptions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['claim', 'action'],
            properties: {
              claim: { type: 'string' },
              action: { type: 'string' }
            }
          }
        },
        weaknessPriority: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    questions: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const QUESTION_SYSTEM_PROMPT = `You are running an interactive proposal-agent workflow.

Return strict JSON:
{
  "project": {
    "title": "",
    "problem": "",
    "method": "",
    "timeline": "",
    "evaluation": "",
    "successThreshold": "",
    "relatedWork": "",
    "novelty": "",
    "figurePrompt": "",
    "resources": "",
    "references": ""
  },
  "fieldSuggestions": [
    {
      "field": "title | problem | method | timeline | evaluation | successThreshold | relatedWork | novelty | figurePrompt | resources | references",
      "label": "human-readable label",
      "value": "specific suggested content",
      "confidence": "High | Medium | Low",
      "reason": "why this suggestion fits the rough idea"
    }
  ],
  "decisions": [
    {
      "id": "short-stable-id",
      "title": "decision title",
      "field": "problem | method | timeline | evaluation | successThreshold | relatedWork | novelty | figurePrompt | resources | references",
      "question": "context-aware decision prompt",
      "options": [
        {
          "label": "short option label",
          "value": "content to write into the project state",
          "rationale": "when this option is a good fit"
        }
      ]
    }
  ],
  "questions": [
    {
      "field": "problem | method | evaluation | successThreshold | relatedWork | novelty | figurePrompt | timeline | resources | references",
      "question": "one concise question",
      "reason": "why this answer matters",
      "priority": "High | Medium | Low"
    }
  ],
  "updates": ["short state update"]
}

First infer concrete proposal data from the rough idea. Give the user suggested data and selectable options before asking open-ended questions. Ask open-ended questions only for information that cannot be reasonably inferred.`;

export async function startAgentSession(payload) {
  const project = normalizePayload(payload);
  const checklist = extractChecklist(project.requirements || DEFAULT_REQUIREMENTS);

  if (process.env.LLM_API_KEY && process.env.LLM_API_URL) {
    const result = await refineProjectWithApi({
      task: 'start',
      project,
      checklist,
      activeQuestion: null,
      answer: ''
    });

    return {
      ...result,
      project: keepOnlyAcceptedStartFields(project, result.project),
      checklist,
      inputSummary: summarizeProjectInput(result.project),
      runMessage: `Initialized topic and prepared ${result.fieldSuggestions.length} suggested field(s) and ${result.decisions.length} decision card(s).`
    };
  }

  const questions = buildQuestionObjects(project);
  const fieldSuggestions = buildFieldSuggestions(project);
  const decisions = buildDecisionCards(project);

  return {
    mode: 'local-fallback',
    provider: 'template',
    project,
    checklist,
    suggestedProject: projectFromSuggestions(project, fieldSuggestions),
    fieldSuggestions,
    decisions,
    questions,
    inputSummary: summarizeProjectInput(project),
    updates: [`Initialized topic: ${project.title}.`],
    runMessage: `Initialized topic and prepared ${fieldSuggestions.length} fallback suggestion(s).`,
    transcript: {
      prompt: { task: 'start', project, checklist },
      rawResponse: 'Generated by local fallback because LLM_API_KEY or LLM_API_URL is not configured.'
    }
  };
}

export async function answerAgentQuestion(payload) {
  const project = normalizePayload(payload.project || payload);
  const checklist = extractChecklist(project.requirements || payload.requirements || DEFAULT_REQUIREMENTS);
  const activeQuestion = normalizeQuestion(payload.question);
  const answer = clean(payload.answer);

  if (process.env.LLM_API_KEY && process.env.LLM_API_URL) {
    const result = await refineProjectWithApi({
      task: 'integrate-answer',
      project,
      checklist,
      activeQuestion,
      answer
    });

    return {
      ...result,
      checklist,
      inputSummary: summarizeProjectInput(result.project),
      runMessage: result.updates.join(' ') || 'Integrated answer with model reasoning.'
    };
  }

  const integration = integrateAnswerLocally(project, answer, activeQuestion);
  const questions = buildQuestionObjects(integration.project);

  return {
    mode: 'local-fallback',
    provider: 'template',
    project: integration.project,
    checklist,
    suggestedProject: projectFromSuggestions(integration.project, buildFieldSuggestions(integration.project)),
    fieldSuggestions: buildFieldSuggestions(integration.project),
    decisions: buildDecisionCards(integration.project),
    questions,
    inputSummary: summarizeProjectInput(integration.project),
    updates: integration.updates,
    runMessage: `${integration.updates.join(' ')} ${questions.length} follow-up question(s) remain.`.trim(),
    transcript: {
      prompt: { task: 'integrate-answer', project, activeQuestion, answer, checklist },
      rawResponse: 'Integrated by local fallback because LLM_API_KEY or LLM_API_URL is not configured.'
    }
  };
}

export async function generateProposal(payload) {
  const project = normalizePayload(payload);
  const requirements = project.requirements || DEFAULT_REQUIREMENTS;
  const checklist = extractChecklist(requirements);

  if (process.env.LLM_API_KEY && process.env.LLM_API_URL) {
    return generateWithApi(project, checklist);
  }

  return generateLocally(project, checklist);
}

async function refineProjectWithApi(payload) {
  const model = clean(process.env.LLM_MODEL);

  if (!model) {
    throw new Error('LLM_MODEL is required when LLM_API_KEY and LLM_API_URL are configured.');
  }

  const content = await callModel({
    systemPrompt: QUESTION_SYSTEM_PROMPT,
    payload,
    model,
    temperature: 0.2
  });
  const parsed = parseJsonContent(content);
  const nextProject = mergeProject(payload.project, normalizePayload(parsed.project || {}));
  const fieldSuggestions = normalizeFieldSuggestions(parsed.fieldSuggestions, nextProject);
  const decisions = normalizeDecisions(parsed.decisions, nextProject);
  const questions = normalizeQuestions(parsed.questions, nextProject);

  return {
    mode: 'api',
    provider: process.env.LLM_API_URL,
    project: nextProject,
    suggestedProject: nextProject,
    fieldSuggestions,
    decisions,
    questions,
    updates: Array.isArray(parsed.updates) ? parsed.updates.map(clean).filter(Boolean) : ['Updated project state.'],
    transcript: {
      prompt: payload,
      rawResponse: content
    }
  };
}

async function fetchRelatedPapersForProject(project, limit = 4) {
  const query = [
    project.title,
    project.problem,
    project.method,
    'AI writing feedback proposal review automated critique'
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 450);

  if (!query.trim()) return '';

  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', 'title,abstract,year,authors,url,citationCount');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Semantic Scholar search failed with status ${response.status}`);
  }

  const data = await response.json();
  const papers = Array.isArray(data.data) ? data.data : [];

  return papers
    .filter((paper) => paper.title && paper.abstract)
    .slice(0, limit)
    .map((paper, index) => {
      const authors = Array.isArray(paper.authors)
        ? paper.authors.slice(0, 3).map((author) => author.name).filter(Boolean).join(', ')
        : 'Unknown authors';

      return [
        `Related paper ${index + 1}: ${paper.title}`,
        `Authors: ${authors}`,
        `Year: ${paper.year || 'Unknown'}`,
        `Citation count: ${paper.citationCount ?? 'Unknown'}`,
        `URL: ${paper.url || 'No URL returned'}`,
        `Abstract: ${paper.abstract}`
      ].join('\n');
    })
    .join('\n\n');
}

function relatedWorkNeedsPapers(relatedWork) {
  const text = String(relatedWork || '').toLowerCase();

  return (
    !text.trim() ||
    text.includes('paste 2-4 related paper abstracts here') ||
    text.includes('paste 2–4 related paper abstracts here')
  );
}

async function generateWithApi(project, checklist) {
  const model = clean(process.env.LLM_MODEL);

  if (!model) {
    throw new Error('LLM_MODEL is required when LLM_API_KEY and LLM_API_URL are configured.');
  }

  let projectWithPapers = { ...project };

  if (relatedWorkNeedsPapers(project.relatedWork)) {
    try {
      const fetchedPapers = await fetchRelatedPapersForProject(project, 4);

      if (fetchedPapers) {
        projectWithPapers = {
          ...projectWithPapers,
          relatedWork: fetchedPapers,
          references: mergeField(
            projectWithPapers.references,
            'Related work was retrieved from Semantic Scholar Academic Graph API using the project title/problem as the search query.'
          )
        };
      }
    } catch (error) {
      projectWithPapers = {
        ...projectWithPapers,
        relatedWork: mergeField(
          projectWithPapers.relatedWork,
          `Paper search failed: ${error.message}. Student should paste 2-4 related abstracts manually.`
        )
      };
    }
  }

  const promptPayload = {
    project: projectWithPapers,
    checklist,
    outputContract: {
      proposalLatex: 'Complete compile-ready LaTeX source for proposal.tex',
      complianceMatrix: 'Array of requirement coverage rows',
      evaluationReport: 'Plain text or Markdown self-evaluation including pre-mortem rejection risks',
      preMortem: 'Rejection risk scores, reviewer persona objections with rescue plans, unsupported assumption flags, novelty/gap checks, and ordered weakness priority list',
      questions: 'Remaining clarifying questions'
    }
  };

  const content = await callModel({
    systemPrompt: SYSTEM_PROMPT,
    payload: promptPayload,
    model,
    temperature: 0.2,
    responseSchema: PROPOSAL_RESPONSE_SCHEMA
  });

  const parsed = parseJsonContent(content);

  return {
    mode: 'api',
    provider: process.env.LLM_API_URL,
    ...coerceResult(parsed, projectWithPapers, checklist),
    transcript: {
      prompt: promptPayload,
      rawResponse: content
    }
  };
}



async function callModel({ systemPrompt, payload, model, temperature, responseSchema }) {
  if (getProvider() === 'gemini') {
    return callGemini({ systemPrompt, payload, model, temperature, responseSchema });
  }

  return callOpenAiCompatible({ systemPrompt, payload, model, temperature });
}

async function callGemini({ systemPrompt, payload, model, temperature, responseSchema }) {
  const baseUrl = clean(process.env.LLM_API_URL) || 'https://generativelanguage.googleapis.com/v1beta';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.LLM_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(payload, null, 2) }]
        }
      ],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {})
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini API returned ${response.status}`);
  }

  const content = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n');

  if (!content) {
    throw new Error('Gemini API returned no text content.');
  }

  return content;
}

async function callOpenAiCompatible({ systemPrompt, payload, model, temperature }) {
  const response = await fetch(process.env.LLM_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload, null, 2) }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `API returned ${response.status}`);
  }

  return readModelContent(data);
}

function generateLocally(project, checklist) {
  const questions = buildQuestions(project);
  const proposalLatex = buildLocalProposalLatex(project);
  const complianceMatrix = checklist.map((requirement) => {
    const evidence = findRequirementEvidence(requirement, project);

    return {
      requirement,
      status: evidence ? 'Covered' : 'Needs work',
      evidence: evidence || 'No strong evidence in the current project state.',
      fix: evidence ? 'Keep this section specific.' : `Add concrete detail for: ${requirement}.`
    };
  });

  const needsWork = complianceMatrix.filter((row) => row.status === 'Needs work');
  const evaluationReport = `# Evaluation Report

## Summary
- Mode: local deterministic fallback.
- Covered requirements: ${complianceMatrix.length - needsWork.length}/${complianceMatrix.length}.
- Remaining questions: ${questions.length}.

## Weak Claims And Risks
${needsWork.length ? needsWork.map((row) => `- ${row.requirement}: ${row.fix}`).join('\n') : '- No missing checklist items detected by the fallback checker.'}

## Revision Priorities
${questions.length ? questions.map((question) => `- ${question}`).join('\n') : '- Draft is ready for API-backed review or human revision.'}
`;

  const preMortem = {
    scores: {
      novelty: 5,
      clarity: 5,
      feasibility: 5,
      evaluation_rigor: 5,
      gap_specificity: 5,
      method_concreteness: 5
    },
    risks: [
      {
        severity: 'high',
        title: 'Research gap not specific enough',
        objection: 'The proposal does not name a specific prior system or paper that attempted this and fell short.',
        rescue: 'Name a specific related system and explain exactly what it lacks that your approach addresses.'
      },
      {
        severity: 'medium',
        title: 'Evaluation plan lacks baseline',
        objection: 'There is no baseline comparison, so it is unclear what improvement would look like.',
        rescue: 'Add a named baseline system and define a concrete metric with a success threshold.'
      },
      {
        severity: 'low',
        title: 'Timeline may be overoptimistic',
        objection: 'The milestones do not account for iteration time after evaluation.',
        rescue: 'Add a buffer phase after evaluation for revision and source note cleanup.'
      }
    ],
    assumptions: [
      {
        claim: 'The proposed workflow will improve proposal quality',
        action: 'Cite prior work on iterative AI-assisted writing or mark as assumption pending evaluation.'
      },
      {
        claim: 'Students will engage meaningfully with agent suggestions',
        action: 'Soften to "we expect" and note this will be measured in the evaluation.'
      }
    ],
    weaknessPriority: [
      'Sharpen the research gap with a named prior system',
      'Add a concrete baseline and metric to the evaluation plan',
      'Include a workflow figure or architecture diagram'
    ]
  };

  return {
    mode: 'local-fallback',
    provider: 'template',
    proposalLatex,
    complianceMatrix,
    evaluationReport,
    preMortem,
    questions,
    transcript: {
      prompt: { project, checklist },
      rawResponse: 'Generated by local fallback because LLM_API_KEY or LLM_API_URL is not configured.'
    }
  };
}

function buildLocalProposalLatex(project) {
  const title = project.title || project.topic;
  const problem = project.problem || 'The current problem is still underspecified and should be refined through clarifying questions.';
  const method = project.method || 'The agent workflow will collect a rough research direction, ask targeted clarification questions, update project state, draft a research proposal, check requirements, and revise weak sections.';
  const evaluation = project.evaluation || 'Evaluate the first and revised drafts against section coverage, missing fields, weak claims, prior-work comparison, research milestones, and proposal-specific success criteria.';
  const successThreshold = project.successThreshold || 'A successful revision improves at least four of six pre-mortem dimensions and resolves all missing evaluation-plan fields.';
  const relatedWork = project.relatedWork || 'Related paper abstracts will be pasted by the student. Until then, the novelty comparison is marked as an assumption.';
  const novelty = project.novelty || 'The proposed contribution is distinct because it focuses on reviewer-style pre-mortem critique, rescue plans, and revision evidence rather than only generating a polished draft.';
  const figurePrompt = project.figurePrompt || 'Create a workflow diagram with boxes for rough idea, structured checks, pre-mortem scoring, reviewer personas, rescue plan, revision loop, and transcript export.';
  const timeline = project.timeline || 'Phase 1 literature and requirement review; Phase 2 workflow and method design; Phase 3 prototype or study setup; Phase 4 evaluation and analysis; Phase 5 final proposal revision and source notes.';
  const resources = project.resources || 'This browser app, a local Node API service, an optional LLM API key, proposal-writing references, and source notes for unsupported claims.';
  const references = project.references || 'Course proposal requirements and demo scaffold. Additional claims are treated as assumptions.';

  return String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage[hidelinks]{hyperref}
\usepackage{enumitem}
\setlist{nosep}
\title{${escapeLatex(title)}}
\author{}
\date{}

\begin{document}
\maketitle

\begin{abstract}
This project builds a proposal pre-mortem agent that turns a rough research direction into a structured research proposal, then predicts likely reviewer objections before submission. The workflow collects project intent, drafts a LaTeX proposal, checks requirements, and runs a pre-mortem analysis that scores each section and generates a rescue plan for weak spots.
\end{abstract}

\section{Motivation and Gap}
${latexParagraph(problem)}

Students often have partial ideas but need help converting them into proposal sections with clear methods, milestones, and evaluation criteria. Existing AI tools generate polished drafts but do not help students anticipate reviewer objections. \textbf{Assumption:} a pre-mortem workflow that surfaces rejection risks before submission will produce stronger final proposals than generation-only tools.

\section{Related Work and Novelty}
${latexParagraph(relatedWork)}

${latexParagraph(novelty)}

\section{Project Goal}
Create a working proposal pre-mortem agent that produces a LaTeX proposal, compliance matrix, rejection risk scores, reviewer objections with rescue plans, and unsupported assumption flags from a rough idea.

\section{Method and Agent Workflow}
${latexParagraph(method)}

\begin{enumerate}
\item Student enters a rough research idea.
\item Agent extracts structured proposal fields and presents suggestions.
\item Student accepts, edits, or rejects each suggestion.
\item Agent drafts a full LaTeX proposal from accepted fields.
\item Agent runs a pre-mortem: scores each section, generates reviewer objections, flags unsupported assumptions, and produces a rescue plan.
\item Student revises based on rescue plan and re-runs the pre-mortem to verify improvement.
\end{enumerate}

\section{Workflow Diagram}
\begin{figure}[h]
\centering
\fbox{\begin{minipage}{0.9\linewidth}
\centering
Rough idea $\rightarrow$ structured suggestions $\rightarrow$ student decisions $\rightarrow$ accepted state $\rightarrow$ LaTeX draft $\rightarrow$ pre-mortem report $\rightarrow$ rescue plan $\rightarrow$ revised PDF
\end{minipage}}
\caption{Proposal Pre-Mortem Agent workflow: from rough idea to reviewer-hardened proposal. The planned diagram prompt is: ${escapeLatex(figurePrompt)}}
\end{figure}

\section{Expected Results and Research Milestones}
${latexParagraph(timeline)}

Expected result: a reproducible workflow that starts from a rough research direction, produces proposal artifacts, and surfaces rejection risks with concrete revision steps before submission.

\section{Evaluation Plan}
${latexParagraph(evaluation)}

Success threshold: ${latexParagraph(successThreshold)}

Test cases include: (1) a complete idea with strong sections, (2) a missing-information idea that triggers gap and evaluation flags, (3) an idea with unsupported claims that the assumption auditor catches, and (4) a revision case showing that pre-mortem scores improve after the rescue plan is applied.

\section{Risks and Mitigation}
\begin{itemize}
\item API key is missing: use deterministic fallback with template-based pre-mortem scores.
\item Generated claims are unsupported: mark as assumptions and request source notes.
\item Research scope too broad: use gap specificity checker to force narrowing before draft generation.
\item Pre-mortem scores are too lenient: calibrate prompts against known weak proposals.
\end{itemize}

\section{Resources}
${latexParagraph(resources)}

\section{References and Assumptions}
${latexParagraph(references)}

\end{document}
`;
}

function buildQuestions(project) {
  return buildQuestionObjects(project).map((question) => question.question);
}

function buildQuestionObjects(project) {
  const questions = [];
  const add = (field, question, reason, priority = 'High') => {
    questions.push({
      id: `${field}-${questions.length + 1}`,
      field,
      question,
      reason,
      priority
    });
  };

  if (!isSpecific(project.problem, 80)) {
    add(
      'problem',
      'What concrete problem does this proposal solve, and who experiences it?',
      'The proposal needs a specific motivation and user or stakeholder.'
    );
  }

  if (!isSpecific(project.method, 80)) {
    add(
      'method',
      'What exact workflow or technical method will the project implement?',
      'The method should describe stages, inputs, outputs, and the API-backed loop.'
    );
  }

  if (!isSpecific(project.evaluation, 60)) {
    add(
      'evaluation',
      'What measurable checks will prove the revised proposal is better than the first draft?',
      'The evaluation plan needs concrete tests or metrics.'
    );
  }

  if (!isSpecific(project.successThreshold, 35)) {
    add(
      'successThreshold',
      'What baseline, metric, test context, and success threshold will prove the revision is better?',
      'The evaluation validator needs a concrete success threshold.',
      'High'
    );
  }

  if (!isSpecific(project.relatedWork, 60)) {
    add(
      'relatedWork',
      'What related paper abstracts or prior systems should the novelty comparator use?',
      'The novelty comparator needs related-work text instead of invented citations.',
      'Medium'
    );
  }

  if (!isSpecific(project.figurePrompt, 45)) {
    add(
      'figurePrompt',
      'What workflow diagram should the proposal include?',
      'The figure prompter needs a plain-text diagram description.',
      'Medium'
    );
  }

  if (!isSpecific(project.timeline, 40)) {
    add(
      'timeline',
      'What research milestones and timeline estimates make this proposal credible?',
      'The proposal needs scoped milestones, feasibility evidence, and realistic risks.'
    );
  }

  if (!isSpecific(project.resources, 30)) {
    add(
      'resources',
      'What tools, APIs, files, or fallback mode will make this reproducible?',
      'The proposal needs implementation resources and API-key handling.',
      'Medium'
    );
  }

  if (!isSpecific(project.references, 30)) {
    add(
      'references',
      'What sources or assumptions should ground the claims?',
      'Unsupported claims should be marked as assumptions or tied to source notes.',
      'Medium'
    );
  }

  if (!questions.length) {
    add(
      'next-step',
      'The project state looks draftable. Should I generate the proposal now?',
      'No required missing field remains in the basic checker.',
      'Low'
    );
  }

  return questions.slice(0, 5);
}

function integrateAnswerLocally(project, answer, question) {
  const targetField = question?.field && question.field !== 'next-step' ? question.field : firstMissingField(project);
  const nextProject = { ...project };
  const updates = [];

  if (targetField && Object.hasOwn(nextProject, targetField)) {
    nextProject[targetField] = mergeField(nextProject[targetField], answer);
    updates.push(`Updated ${targetField}.`);
  } else {
    nextProject.method = mergeField(nextProject.method, answer);
    updates.push('Updated method.');
  }

  return { project: nextProject, updates };
}

function buildFieldSuggestions(project) {
  const topic = project.title || project.topic || 'the project';
  const suggestions = [
    {
      field: 'title',
      label: 'Project Title',
      value: project.title || titleCase(topic),
      confidence: 'High',
      reason: 'Use the rough idea as the working title so the proposal has a stable anchor.'
    },
    {
      field: 'problem',
      label: 'Problem Framing',
      value:
        project.problem ||
        `Students or project authors have a rough idea for ${topic}, but need help turning it into a structured, rubric-aligned proposal with clear scope and evaluation. Existing AI tools generate polished drafts but do not help students anticipate reviewer objections before submission.`,
      confidence: project.problem ? 'High' : 'Medium',
      reason: 'A proposal needs a concrete user pain point before method details are useful.'
    },
    {
      field: 'method',
      label: 'Method / Agent Workflow',
      value:
        project.method ||
        'Build a proposal pre-mortem agent that extracts project state from a rough idea, presents suggested fields and decision options, accepts user edits, drafts a LaTeX proposal, runs a pre-mortem scoring pass, generates reviewer objections and rescue plans, and tracks revision history across rounds.',
      confidence: project.method ? 'High' : 'Medium',
      reason: 'The method should describe the agent process including the pre-mortem loop, not just promise a final draft.'
    },
    {
      field: 'evaluation',
      label: 'Evaluation Plan',
      value:
        project.evaluation ||
        'Test complete, missing-info, unsupported-claim, and revision scenarios. Compare pre-mortem scores before and after rescue plan is applied. Measure section coverage, specificity, and whether assumption flags are resolved across rounds.',
      confidence: project.evaluation ? 'High' : 'Medium',
      reason: 'The course proposal needs evidence that the pre-mortem workflow improves the artifact.'
    },
    {
      field: 'timeline',
      label: 'Research Milestones',
      value:
        project.timeline ||
        'Phase 1: proposal-writing and pre-mortem methodology research. Phase 2: workflow and pre-mortem scoring design. Phase 3: prototype implementation with fallback mode. Phase 4: evaluation across test cases and revision loop validation. Phase 5: final proposal revision and source notes.',
      confidence: project.timeline ? 'High' : 'Medium',
      reason: 'Research milestones help reviewers judge feasibility, expected outcomes, and scope.'
    },
    {
      field: 'successThreshold',
      label: 'Success Threshold',
      value:
        project.successThreshold ||
        'Success means the revised draft improves by at least 2 points in evaluation rigor or gap specificity, includes a named baseline, and resolves all missing baseline/metric/context/threshold flags.',
      confidence: project.successThreshold ? 'High' : 'Medium',
      reason: 'A clear threshold keeps the evaluation from sounding subjective.'
    },
    {
      field: 'relatedWork',
      label: 'Related Work Abstracts',
      value:
        project.relatedWork ||
        'Paste 2-4 related paper abstracts here. The novelty comparator will compare your proposed contribution against what those abstracts already claim.',
      confidence: project.relatedWork ? 'High' : 'Low',
      reason: 'The agent should not invent related work; it needs student-provided abstracts or source notes.'
    },
    {
      field: 'novelty',
      label: 'Novelty Comparator',
      value:
        project.novelty ||
        'The contribution is distinct because it turns proposal generation into a reviewer-style pre-mortem workflow with structural checks, persona objections, rescue plans, before/after evidence, and usage logging.',
      confidence: project.novelty ? 'High' : 'Medium',
      reason: 'This states why the agent is more than a generic writing tool.'
    },
    {
      field: 'figurePrompt',
      label: 'Figure / Diagram Prompt',
      value:
        project.figurePrompt ||
        'Draw a left-to-right workflow: rough idea → section coverage checker → novelty comparator → pre-mortem scoring/radar chart → reviewer persona objections → rescue plan → revised proposal/PDF/transcript.',
      confidence: project.figurePrompt ? 'High' : 'Medium',
      reason: 'A diagram prompt helps produce the required figure without relying on external image files.'
    },
    {
      field: 'resources',
      label: 'Resources',
      value: project.resources || 'React, Vite, Node, LLM API, local fallback mode, sample research ideas, NSF GRFP proposal examples, and course requirements.',
      confidence: project.resources ? 'High' : 'Medium',
      reason: 'Resource notes make the API-backed workflow reproducible.'
    },
    {
      field: 'references',
      label: 'Sources / Assumptions',
      value: project.references || 'Course proposal requirements, MIT NSF GRFP proposal guide, Klein (2007) pre-mortem methodology, and explicit assumptions for unsupported claims.',
      confidence: project.references ? 'High' : 'Medium',
      reason: 'Source notes prevent the proposal from inventing unsupported claims.'
    }
  ];

  return suggestions.filter((item) => clean(item.value));
}

function buildDecisionCards(project) {
  const topic = project.title || project.topic || 'this project';

  return [
    {
      id: 'problem-framing',
      title: 'Choose The Problem Framing',
      field: 'problem',
      question: 'Which problem framing should the proposal emphasize?',
      options: [
        {
          label: 'Rejection prediction',
          value: `Students have rough ideas for ${topic}, but even polished AI-generated drafts get rejected because students cannot anticipate reviewer objections before submission.`,
          rationale: 'Best when the pre-mortem angle is the main contribution.'
        },
        {
          label: 'Revision quality',
          value: `Students can produce a first draft for ${topic}, but need help identifying weak claims, missing evidence, and unclear evaluation plans before submission.`,
          rationale: 'Best when the agent focuses on critique and revision loops.'
        },
        {
          label: 'Reviewer simulation',
          value: `Students lack exposure to how different reviewer types evaluate proposals, so they cannot anticipate objections from skeptical methodologists, domain experts, or funding officers.`,
          rationale: 'Best when reviewer persona simulation is the key feature.'
        }
      ]
    },
    {
      id: 'method-style',
      title: 'Choose The Agent Method',
      field: 'method',
      question: 'What should the core agent workflow optimize for?',
      options: [
        {
          label: 'Pre-mortem first',
          value:
            'The agent drafts the proposal quickly, then immediately runs a pre-mortem scoring pass and generates rescue plans before the student sees the draft.',
          rationale: 'Best for making rejection prediction the centerpiece of the demo.'
        },
        {
          label: 'Iterative revision',
          value:
            'The agent drafts, scores, the student revises, and the agent re-scores to show measurable improvement across rounds.',
          rationale: 'Best for a visible before-and-after revision loop.'
        },
        {
          label: 'Reviewer debate',
          value:
            'One agent writes the proposal and a separate critic agent attacks it. The student watches the debate and decides which objections to address.',
          rationale: 'Best for a dramatic and memorable demo.'
        }
      ]
    },
    {
      id: 'evaluation-choice',
      title: 'Choose Evaluation Evidence',
      field: 'evaluation',
      question: 'How should the demo prove the pre-mortem workflow is useful?',
      options: [
        {
          label: 'Score improvement',
          value: 'Show that pre-mortem risk scores improve after the rescue plan is applied. Compare round 1 vs round 2 scores on all six dimensions.',
          rationale: 'Most convincing quantitative evidence of workflow value.'
        },
        {
          label: 'Scenario tests',
          value: 'Run four scenarios: complete idea, missing-info idea, unsupported-claim idea, and post-revision idea. Report which risks and assumptions the agent correctly flags in each case.',
          rationale: 'Best for demonstrating agent reliability across cases.'
        },
        {
          label: 'Before/after proposal',
          value: 'Show the full first draft alongside the revised draft and highlight which weaknesses from the pre-mortem report were resolved.',
          rationale: 'Most readable evidence for a grader reviewing the final submission.'
        }
      ]
    },
    {
      id: 'novelty-choice',
      title: 'Choose Novelty Comparison',
      field: 'novelty',
      question: 'How should the project explain its distinct contribution?',
      options: [
        {
          label: 'Reviewer-first tool',
          value: 'Unlike writing assistants that mainly generate a polished draft, this agent centers reviewer-style critique, structured rejection reasons, and rescue plans before submission.',
          rationale: 'Best for making the gap clear and easy to present.'
        },
        {
          label: 'Evidence loop',
          value: 'The distinct contribution is the revision evidence loop: draft, pre-mortem, rescue, before/after diff, re-score, and transcript export.',
          rationale: 'Best for highlighting Stage 2 artifacts.'
        },
        {
          label: 'Transparency',
          value: 'The agent is distinct because it logs prompts, outputs, and student decisions, turning AI use into a transparent research artifact instead of hidden assistance.',
          rationale: 'Best for documentation and responsible AI use.'
        }
      ]
    }
  ];
}

function normalizeFieldSuggestions(suggestions, project) {
  const parsed = Array.isArray(suggestions)
    ? suggestions
        .map((item) => ({
          field: clean(item.field),
          label: clean(item.label) || labelForField(item.field),
          value: clean(item.value),
          confidence: clean(item.confidence) || 'Medium',
          reason: clean(item.reason) || 'Suggested by the model from the rough idea.'
        }))
        .filter((item) => item.field && item.value)
    : [];

  const fallback = buildFieldSuggestions(project);
  const seen = new Set(parsed.map((item) => item.field));
  const merged = [...parsed, ...fallback.filter((item) => !seen.has(item.field))];

  return merged.length ? merged : fallback;
}

function normalizeDecisions(decisions, project) {
  const parsed = Array.isArray(decisions)
    ? decisions
        .map((decision, index) => ({
          id: clean(decision.id) || `decision-${index + 1}`,
          title: clean(decision.title) || 'Decision Needed',
          field: clean(decision.field) || 'problem',
          question: clean(decision.question) || 'Which option best fits the project?',
          options: Array.isArray(decision.options)
            ? decision.options
                .map((option) => ({
                  label: clean(option.label),
                  value: clean(option.value),
                  rationale: clean(option.rationale)
                }))
                .filter((option) => option.label && option.value)
            : []
        }))
        .filter((decision) => decision.options.length)
    : [];

  return parsed.length ? parsed : buildDecisionCards(project);
}

function projectFromSuggestions(project, suggestions) {
  const next = { ...project };

  suggestions.forEach((suggestion) => {
    if (Object.hasOwn(next, suggestion.field) && suggestion.value) {
      next[suggestion.field] = suggestion.value;
    }
  });

  return next;
}

function keepOnlyAcceptedStartFields(originalProject, suggestedProject) {
  return {
    ...EMPTY_PROJECT_FOR_SERVER,
    ...originalProject,
    title: suggestedProject.title || originalProject.title,
    topic: originalProject.topic || originalProject.title,
    requirements: originalProject.requirements || DEFAULT_REQUIREMENTS
  };
}

function labelForField(field) {
  const labels = {
    title: 'Project Title',
    problem: 'Problem Framing',
    method: 'Method / Agent Workflow',
    timeline: 'Research Milestones',
    evaluation: 'Evaluation Plan',
    successThreshold: 'Success Threshold',
    relatedWork: 'Related Work Abstracts',
    novelty: 'Novelty / Distinct Contribution',
    figurePrompt: 'Figure / Diagram Prompt',
    resources: 'Resources',
    references: 'Sources / Assumptions'
  };

  return labels[clean(field)] || titleCase(field);
}

function summarizeProjectInput(project) {
  const fields = [
    ['Topic', project.title || project.topic],
    ['Problem', project.problem],
    ['Method', project.method],
    ['Timeline', project.timeline],
    ['Evaluation', project.evaluation],
    ['Success Threshold', project.successThreshold],
    ['Related Work', project.relatedWork],
    ['Novelty', project.novelty],
    ['Figure Prompt', project.figurePrompt],
    ['Resources', project.resources],
    ['References', project.references]
  ];
  const missing = buildQuestionObjects(project)
    .filter((question) => question.field !== 'next-step')
    .map((question) => question.reason);

  return {
    fields,
    missing,
    markdown: `# Intake Summary

${fields.map(([label, value]) => `- ${label}: ${clean(value) || 'Missing'}`).join('\n')}

## Missing or Weak Inputs
${missing.length ? missing.map((item) => `- ${item}`).join('\n') : '- None detected by the basic checker.'}
`
  };
}

function normalizeQuestions(questions, project) {
  const parsed = Array.isArray(questions)
    ? questions.map(normalizeQuestion).filter((question) => question.question)
    : [];

  return (parsed.length ? parsed : buildQuestionObjects(project)).slice(0, 5);
}

function normalizeQuestion(question) {
  if (!question) return null;

  if (typeof question === 'string') {
    return {
      id: `question-${question.slice(0, 18)}`,
      field: 'method',
      question: clean(question),
      reason: 'The model requested this clarification.',
      priority: 'High'
    };
  }

  return {
    id: clean(question.id) || `${clean(question.field) || 'question'}-${clean(question.question).slice(0, 18)}`,
    field: clean(question.field) || 'method',
    question: clean(question.question),
    reason: clean(question.reason) || 'This detail will improve the proposal.',
    priority: clean(question.priority) || 'High'
  };
}

function firstMissingField(project) {
  const firstQuestion = buildQuestionObjects(project).find((question) => question.field !== 'next-step');
  return firstQuestion?.field || 'method';
}

function mergeProject(current, incoming) {
  const next = { ...current };

  Object.entries(incoming).forEach(([key, value]) => {
    const cleaned = clean(value);
    if (cleaned) next[key] = cleaned;
  });

  return next;
}

function mergeField(current, addition) {
  const base = clean(current);
  const next = clean(addition);

  if (!base) return next;
  if (!next) return base;
  if (base.toLowerCase().includes(next.toLowerCase())) return base;
  return `${base}\n${next}`;
}

function normalizePayload(payload) {
  return {
    topic: clean(payload.topic),
    title: clean(payload.title) || clean(payload.topic),
    problem: clean(payload.problem),
    method: clean(payload.method),
    timeline: clean(payload.timeline),
    evaluation: clean(payload.evaluation),
    successThreshold: clean(payload.successThreshold),
    relatedWork: clean(payload.relatedWork),
    novelty: clean(payload.novelty),
    figurePrompt: clean(payload.figurePrompt),
    resources: clean(payload.resources),
    references: clean(payload.references),
    reviewerPersona: clean(payload.reviewerPersona),
    requirements: clean(payload.requirements) || DEFAULT_REQUIREMENTS
  };
}

function extractChecklist(requirements) {
  const items = clean(requirements)
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter((line) => line.length > 4)
    .filter((line) => !/^proposal must include:?$/i.test(line));

  return [...new Set(items.length ? items : DEFAULT_REQUIREMENTS.split('\n').slice(1).map((line) => line.replace(/^-\s*/, '')))];
}

function findRequirementEvidence(requirement, project) {
  const text = requirement.toLowerCase();

  if (/title/.test(text) && project.title) return project.title;
  if (/abstract/.test(text)) return 'Draft includes an abstract section.';
  if (/motivation|gap|problem/.test(text) && project.problem) return project.problem;
  if (/goal/.test(text) && project.title) return 'Goal section is generated from the project topic.';
  if (/method|workflow|approach/.test(text) && project.method) return project.method;
  if (/expected|milestone|timeline/.test(text) && project.timeline) return project.timeline;
  if (/evaluation|metric|test/.test(text) && project.evaluation) return project.evaluation;
  if (/baseline|threshold|success/.test(text) && (project.evaluation || project.successThreshold)) return project.successThreshold || project.evaluation;
  if (/related|novel|abstract/.test(text) && (project.relatedWork || project.novelty)) return project.novelty || project.relatedWork;
  if (/figure|diagram/.test(text) && project.figurePrompt) return project.figurePrompt;
  if (/risk|mitigation/.test(text)) return 'Fallback draft includes risks and mitigations.';
  if (/resource|budget|tool/.test(text) && project.resources) return project.resources;
  if (/reference|assumption|source/.test(text) && project.references) return project.references;

  return '';
}

function readModelContent(data) {
  if (typeof data?.choices?.[0]?.message?.content === 'string') {
    return data.choices[0].message.content;
  }

  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  const outputText = data?.output
    ?.flatMap((item) => item?.content || [])
    ?.map((item) => item?.text)
    ?.filter(Boolean)
    ?.join('\n');

  if (outputText) return outputText;

  return JSON.stringify(data);
}

function parseJsonContent(content) {
  const trimmed = clean(content);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    return {
      proposalLatex: looksLikeLatex(trimmed) ? trimmed : '',
      complianceMatrix: [],
      evaluationReport: '# Evaluation Report\n\nThe API returned text that was not JSON.',
      preMortem: null,
      questions: ['Should the API prompt be tightened to return strict JSON?']
    };
  }
}

function coerceResult(result, projectWithPapers, checklist) {
  return {
    proposalLatex: extractProposalLatex(result, projectWithPapers),
    complianceMatrix: Array.isArray(result.complianceMatrix) && result.complianceMatrix.length
      ? result.complianceMatrix.map((row) => ({
          requirement: clean(row.requirement),
          status: clean(row.status) || 'Needs work',
          evidence: clean(row.evidence),
          fix: clean(row.fix)
        }))
      : checklist.map((requirement) => ({
          requirement,
          status: 'Needs work',
          evidence: 'API did not provide matrix evidence.',
          fix: 'Regenerate with stricter output instructions.'
        })),
    evaluationReport: clean(result.evaluationReport) || '# Evaluation Report\n\nNo evaluation report returned.',
    preMortem: requireValidPreMortem(result.preMortem),
    questions: Array.isArray(result.questions) ? result.questions.map(clean).filter(Boolean).slice(0, 5) : []
  };
}

function requireValidPreMortem(preMortem) {
  if (!preMortem || typeof preMortem !== 'object') {
    throw new Error('Gemini did not return a preMortem object. Re-run generation or tighten the prompt/schema.');
  }

  const scores = preMortem.scores || {};
  const requiredScores = ['novelty', 'clarity', 'feasibility', 'evaluation_rigor', 'gap_specificity'];

  const missingScores = requiredScores.filter((key) => typeof scores[key] !== 'number');

  if (missingScores.length) {
    throw new Error(`Gemini returned incomplete preMortem scores. Missing: ${missingScores.join(', ')}`);
  }

  if (!Array.isArray(preMortem.risks) || preMortem.risks.length < 3) {
    throw new Error('Gemini returned incomplete preMortem risks. Expected at least 3 risks.');
  }

  if (!Array.isArray(preMortem.assumptions) || preMortem.assumptions.length < 2) {
    throw new Error('Gemini returned incomplete assumption audit. Expected at least 2 assumptions.');
  }

  if (!Array.isArray(preMortem.weaknessPriority) || preMortem.weaknessPriority.length < 3) {
    throw new Error('Gemini returned incomplete weakness priority list. Expected at least 3 items.');
  }

  return preMortem;
}

function extractProposalLatex(result, project) {
  const candidates = [
    result?.proposalLatex,
    result?.proposalTex,
    result?.latex,
    result?.tex
  ]
    .map(clean)
    .filter(Boolean);

  for (const candidate of candidates) {
    const unwrapped = unwrapLatexCandidate(candidate);
    if (looksLikeLatex(unwrapped)) {
      return unwrapped;
    }
  }

  return buildLocalProposalLatex(project);
}

function unwrapLatexCandidate(value) {
  let candidate = stripCodeFence(clean(value));

  for (let index = 0; index < 3; index += 1) {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) break;

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        candidate = stripCodeFence(parsed);
        continue;
      }

      const nested = parsed?.proposalLatex || parsed?.proposalTex || parsed?.latex || parsed?.tex;
      if (nested) {
        candidate = stripCodeFence(String(nested));
        continue;
      }

      break;
    } catch {
      const extracted = extractNestedLatexString(trimmed);
      if (extracted) {
        candidate = stripCodeFence(extracted);
        continue;
      }
      break;
    }
  }

  return candidate;
}

function stripCodeFence(value) {
  const trimmed = clean(value);
  const fenced = trimmed.match(/```(?:latex|tex)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || trimmed;
}

function isSpecific(value, length) {
  return clean(value).length >= length;
}

function clean(value) {
  return String(value || '').trim();
}

function looksLikeLatex(value) {
  return /^\\(?:documentclass\b|begin\{document\}|section\{)/.test(String(value || '').trim());
}

function extractNestedLatexString(value) {
  const match = String(value || '').match(/"proposalLatex"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:complianceMatrix|evaluationReport|questions)"/);

  if (!match?.[1]) {
    return '';
  }

  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function latexParagraph(value) {
  return escapeLatex(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

function escapeLatex(value) {
  return String(value || '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function getProvider() {
  const provider = clean(process.env.LLM_PROVIDER).toLowerCase();
  const url = clean(process.env.LLM_API_URL).toLowerCase();

  if (provider === 'gemini' || url.includes('generativelanguage.googleapis.com')) {
    return 'gemini';
  }

  return 'openai-compatible';
}

function titleCase(value) {
  return clean(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}