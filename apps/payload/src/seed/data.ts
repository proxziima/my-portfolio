import { b, chip, curious, richText } from './lexical'

export interface DisciplineSeed {
  slug: string; title: string; order: number; level: string; figureCaption: string
  bio: ReturnType<typeof richText>
  curiousNotes: { side: 'left' | 'right'; text: string; formula?: string }[]
}
export interface ExperienceSeed { company: string; chip: string; title: string; startYear: number; endYear?: number; disciplines: string[]; order: number }
export interface ProjectSeed { name: string; chip: string; summary: string; disciplines: string[]; order: number }

export const disciplines: DisciplineSeed[] = [
  {
    slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9 · backend',
    figureCaption: 'Fig. 1 — one request: edge, gateway, services, queue, stores',
    bio: richText([
      ['Hi, I’m Vinicius, a 🇧🇷 Brazilian ', b('software engineer'), ' and builder, though most weeks that just means ', b('backend plumber'), '. I love the early stage of a system, when the ', b('contract'), ' is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.'],
      ['I currently build ', b('order and pricing services'), ' at ', chip('Autodoc', 'A', 'https://autodoc.com.br'), ', where I joined in 2023 and have helped shape the ', b('platform, its deploy path, and its on-call culture'), ' from the ground up. Most days I am still close to the work — ', b('writing Go, reading traces, and sweating the p99'), '.'],
      ['Before Autodoc I worked on ', b('payment integrations'), ' at ', chip('Nexo Labs', 'N'), ', ', b('event-driven refactors'), ' for ', chip('Meridiano', 'M'), ', and ', b('a B2B catalogue'), ' used by 400 stores.'],
      ['I recently designed and coded ', chip('Pipeline Zero', 'P'), ', ', b('a declarative ingestion framework'), ', and ', chip('Sonda', 'S'), ', ', b('a trace sampler that keeps the one percent of spans worth keeping'), '. Small projects like these are my favourite excuse to learn new stuff and try things out.'],
      ['I’m a big ', chip('Ted Lasso', 'TL'), ' fan, and the line that has stayed with me is “Be ', curious(), ', not judgmental.” It’s also a pretty good way to approach systems, if you ask me.'],
    ]),
    curiousNotes: [
      { side: 'right', text: 'Little’s law for the whole stack', formula: 'L = λ·W' },
      { side: 'right', text: '1.2M req/day ≈ 14 rps; at W = 84 ms the queue holds about one request.', formula: 'L ≈ 14 × 0.084 ≈ 1.2' },
      { side: 'left', text: 'p99 budget for checkout', formula: 'W₉₉ ≤ 84 ms' },
      { side: 'left', text: 'every write carries an idempotency key, so a retry is a no-op' },
    ],
  },
  {
    slug: 'ai', title: 'AI engineer', order: 2, level: 'LV 4 · applied ML',
    figureCaption: 'Fig. 2 — a network above the loss surface it descends',
    bio: richText([
      ['Hi, I’m Vinicius, a 🇧🇷 Brazilian ', b('AI engineer'), ' and builder, though most weeks that just means ', b('eval janitor'), '. I love the early stage of a system, when the ', b('dataset'), ' is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.'],
      ['I currently build ', b('retrieval and ranking over 800k parts'), ' at ', chip('Autodoc', 'A', 'https://autodoc.com.br'), ', where I joined in 2023 and have helped shape the ', b('eval harness, its golden sets, and its release gates'), ' from the ground up. Most days I am still close to the work — ', b('writing Python, reading failure cases, and sweating the recall'), '.'],
      ['Before Autodoc I worked on ', b('demand forecasting'), ' at ', chip('Nexo Labs', 'N'), ', ', b('a pt-BR intent classifier'), ' for ', chip('Meridiano', 'M'), ', and ', b('NLP for legal text'), ' at a university lab.'],
      ['I recently designed and coded ', chip('Retriever', 'R'), ', ', b('an eval harness with drift alerts and per-commit scoring'), ', and ', chip('Vozes', 'V'), ', ', b('an open Portuguese speech corpus of 120 hours'), '. Small projects like these are my favourite excuse to learn new stuff and try things out.'],
      ['I’m a big ', chip('Ted Lasso', 'TL'), ' fan, and the line that has stayed with me is “Be ', curious(), ', not judgmental.” It’s also a pretty good way to approach models, if you ask me.'],
    ]),
    curiousNotes: [
      { side: 'right', text: 'what the layers minimise', formula: 'ℒ = −∑ yᵢ log ŷᵢ' },
      { side: 'right', text: 'and how the gradient walks back through them', formula: '∂ℒ/∂Wₗ = δₗ · aₗ₋₁ᵀ' },
      { side: 'left', text: 'the ring is retrieval; the gate is', formula: 'recall@k = |R ∩ Tₖ| / |R|' },
      { side: 'left', text: 'output layer', formula: 'softmax(z)ᵢ = e^{zᵢ} / ∑ e^{zⱼ}' },
    ],
  },
  {
    slug: 'civil', title: 'Civil engineer', order: 3, level: 'LV 9 · structures',
    figureCaption: 'Fig. 3 — Warren truss bridge over the river, 52 m span',
    bio: richText([
      ['Hi, I’m Vinicius, a 🇧🇷 Brazilian ', b('civil engineer'), ' and builder, though most weeks that just means ', b('load-path pedant'), '. I love the early stage of a project, when the ', b('site survey'), ' is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.'],
      ['I currently build ', b('mezzanines and rack structures'), ' at ', chip('Autodoc', 'A', 'https://autodoc.com.br'), ', where I joined in 2023 and have helped shape the ', b('load registry, its inspection cycle, and its sensor network'), ' from the ground up. Most days I am still close to the work — ', b('drawing reinforcement, reading strain data, and sweating the deflection'), '.'],
      ['Before Autodoc I worked on ', b('nine mid-rise buildings'), ' at ', chip('Meridiano', 'M'), ', ', b('bridge rehabilitation plans'), ' for ', chip('DER-MG', 'D'), ', and ', b('a precast catalogue'), ' for a regional plant.'],
      ['I recently designed and instrumented ', chip('Ponte Viva', 'P'), ', ', b('a 52 metre span with strain telemetry and a public dashboard'), ', and ', chip('Concreto', 'C'), ', ', b('a mix optimiser balancing strength, cost and carbon'), '. Small projects like these are my favourite excuse to learn new stuff and try things out.'],
      ['I’m a big ', chip('Ted Lasso', 'TL'), ' fan, and the line that has stayed with me is “Be ', curious(), ', not judgmental.” It’s also a pretty good way to approach structures, if you ask me.'],
    ]),
    curiousNotes: [
      { side: 'right', text: 'uniformly distributed load on the deck', formula: 'w = 12 kN/m' },
      { side: 'right', text: 'simply supported, so the moment peaks at mid-span', formula: 'Mₘₐₓ = wL²/8' },
      { side: 'right', text: 'and the deck sags by', formula: 'δₘₐₓ = 5wL⁴ / 384EI' },
      { side: 'left', text: 'each pier carries half', formula: 'Rₐ = Rᵦ = wL/2' },
      { side: 'left', text: 'span', formula: 'L = 52 m' },
    ],
  },
]

// Work rows appear once per (company, title). `order` is the row's position in the
// source list of the discipline it came from (all 12 rows are distinct, so none is shared).
export const experiences: ExperienceSeed[] = [
  { company: 'Autodoc', chip: 'A', title: 'Senior Software Engineer', startYear: 2023, disciplines: ['se'], order: 1 },
  { company: 'Nexo Labs', chip: 'N', title: 'Backend Engineer', startYear: 2021, endYear: 2023, disciplines: ['se'], order: 2 },
  { company: 'Meridiano', chip: 'M', title: 'Full-stack Engineer', startYear: 2019, endYear: 2021, disciplines: ['se'], order: 3 },
  { company: 'Kyte', chip: 'K', title: 'Engineer, Platform', startYear: 2017, endYear: 2019, disciplines: ['se'], order: 4 },

  { company: 'Autodoc', chip: 'A', title: 'AI Engineer', startYear: 2024, disciplines: ['ai'], order: 1 },
  { company: 'Nexo Labs', chip: 'N', title: 'Machine Learning Engineer', startYear: 2022, endYear: 2024, disciplines: ['ai'], order: 2 },
  { company: 'UFMG', chip: 'U', title: 'Research Assistant, NLP', startYear: 2021, endYear: 2022, disciplines: ['ai'], order: 3 },
  { company: 'Kyte', chip: 'K', title: 'Data Scientist', startYear: 2019, endYear: 2021, disciplines: ['ai'], order: 4 },

  { company: 'Autodoc', chip: 'A', title: 'Facilities & Structures Lead', startYear: 2023, disciplines: ['civil'], order: 1 },
  { company: 'Meridiano', chip: 'M', title: 'Structural Engineer', startYear: 2019, endYear: 2023, disciplines: ['civil'], order: 2 },
  { company: 'DER-MG', chip: 'D', title: 'Bridge Engineer', startYear: 2017, endYear: 2019, disciplines: ['civil'], order: 3 },
  { company: 'UFMG', chip: 'U', title: 'Structures Lab Assistant', startYear: 2015, endYear: 2017, disciplines: ['civil'], order: 4 },
]

export const projects: ProjectSeed[] = [
  { name: 'Pipeline Zero', chip: 'P', summary: 'Declarative ingestion — YAML in, typed Parquet out.', disciplines: ['se'], order: 1 },
  { name: 'Kernel CLI', chip: 'K', summary: 'Scaffold, seed and tear down an environment in one command.', disciplines: ['se'], order: 2 },
  { name: 'Sonda', chip: 'S', summary: 'A trace sampler that keeps the spans which explain an outage.', disciplines: ['se'], order: 3 },

  { name: 'Retriever', chip: 'R', summary: 'Eval harness: golden sets, drift alerts, per-commit scoring.', disciplines: ['ai'], order: 1 },
  { name: 'Vozes', chip: 'V', summary: 'Open pt-BR speech corpus, 120 hours, speaker balanced.', disciplines: ['ai'], order: 2 },
  { name: 'Pareto', chip: 'P', summary: 'A prompt optimiser that trades tokens against measured accuracy.', disciplines: ['ai'], order: 3 },

  { name: 'Ponte Viva', chip: 'P', summary: 'Strain telemetry on a 52 m span, with a dashboard for the road agency.', disciplines: ['civil'], order: 1 },
  { name: 'Concreto', chip: 'C', summary: 'A mix optimiser balancing strength, cost and carbon per cubic metre.', disciplines: ['civil'], order: 2 },
  { name: 'Carga', chip: 'G', summary: 'A moving-load solver that draws influence lines while you drag.', disciplines: ['civil'], order: 3 },
]

export const profile = {
  name: 'Vinicius Queiroz',
  headlineTail: 'and builder.',
  email: 'vqueiroz@autodoc.com.br',
  location: 'Brazil',
  status: 'available' as const,
  statusMessage: 'building things on the web, one pixel at a time',
}
export const contactLinks = [
  { label: 'Send me a message', chip: '@', url: 'mailto:vqueiroz@autodoc.com.br' },
  { label: '/in/vqueiroz', chip: 'in', url: 'https://www.linkedin.com/in/vqueiroz' },
  { label: '@vqueiroz', chip: 'gh', url: 'https://github.com/vqueiroz' },
]
export const navigationItems = [
  { label: 'Work', href: '#work', newTab: false },
  { label: 'Projects', href: '#projects', newTab: false },
]
export const defaultDisciplineSlug = 'se'

// No real content & community data is available yet; the web hides the section when empty.
export const content: never[] = []

// Only the content: the window title, the visitor and the labels keep the global's field defaults.
export const messenger = {
  whatsNew: [
    { text: 'Vinicius added Messenger to his desktop.', linkLabel: 'See the site', url: '/' },
    { text: 'Vinicius rebuilt his desktop as a Windows 98 PC.', linkLabel: 'Open it full screen', url: '/os' },
  ],
  spotlight: {
    title: 'Doom boots on this desktop',
    text: 'The 1993 shareware episode runs in js-dos, right next to Messenger.',
    url: '/os',
    source: 'My Desktop',
  },
}
