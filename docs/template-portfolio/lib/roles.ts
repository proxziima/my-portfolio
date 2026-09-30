import type { RoleKey, Role, ClassCard } from './types';

/** Content. All prose is placeholder — the three bios are deliberately the same
 *  sentences with different vocabulary, which is what makes the word morph work.
 *  Keep them parallel when you rewrite them. */

export const ORDER: RoleKey[] = [
  "se",
  "ai",
  "civil"
];

/** A favicon-chip link, as used inside the bio strings. */
export const A = (text: string, chip: string, href = '#') =>
  `<a class="fav" href="${href}"><i class="chip">${chip}</i><span>${text}</span></a>`;

/** The curious-mode switch, inlined in the Ted Lasso line of every bio. */
export const CUR =
  '<button class="curiosity-trigger" type="button" role="switch" aria-checked="false"' +
  ' aria-label="Curious mode" aria-controls="curiosity-overlay">' +
  '<span class="curiosity-word">curious</span>' +
  '<span class="curiosity-switch-track" aria-hidden="true"><span class="curiosity-switch-thumb"></span></span>' +
  '</button>';

export const ROLES: Record<RoleKey, Role> = {
  "se": {
    "reel": "Software engineer",
    "say": "Software engineer",
    "plate": "Fig. 1 — one request: edge, gateway, services, queue, stores",
    "bio": [
      "Hi, I’m Vinicius, a 🇧🇷 Brazilian <strong>software engineer</strong> and builder, though most weeks that just means <strong>backend plumber</strong>. I love the early stage of a system, when the <strong>contract</strong> is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.",
      "I currently build <strong>order and pricing services</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">A</i><span>Autodoc</span></a>, where I joined in 2023 and have helped shape the <strong>platform, its deploy path, and its on-call culture</strong> from the ground up. Most days I am still close to the work — <strong>writing Go, reading traces, and sweating the p99</strong>.",
      "Before Autodoc I worked on <strong>payment integrations</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">N</i><span>Nexo Labs</span></a>, <strong>event-driven refactors</strong> for <a class=\"fav\" href=\"#\"><i class=\"chip\">M</i><span>Meridiano</span></a>, and <strong>a B2B catalogue</strong> used by 400 stores.",
      "I recently designed and coded <a class=\"fav\" href=\"#\"><i class=\"chip\">P</i><span>Pipeline Zero</span></a>, <strong>a declarative ingestion framework</strong>, and <a class=\"fav\" href=\"#\"><i class=\"chip\">S</i><span>Sonda</span></a>, <strong>a trace sampler that keeps the one percent of spans worth keeping</strong>. Small projects like these are my favourite excuse to learn new stuff and try things out.",
      "I’m a big <a class=\"fav\" href=\"#\"><i class=\"chip\">TL</i><span>Ted Lasso</span></a> fan, and the line that has stayed with me is “Be <button class=\"curiosity-trigger\" type=\"button\" role=\"switch\" aria-checked=\"false\" aria-label=\"Curious mode\" aria-controls=\"curiosity-overlay\"><span class=\"curiosity-word\">curious</span><span class=\"curiosity-switch-track\" aria-hidden=\"true\"><span class=\"curiosity-switch-thumb\"></span></span></button>, not judgmental.” It’s also a pretty good way to approach systems, if you ask me."
    ],
    "work": [
      [
        "A",
        "Autodoc",
        "Senior Software Engineer",
        "2023–"
      ],
      [
        "N",
        "Nexo Labs",
        "Backend Engineer",
        "2021–23"
      ],
      [
        "M",
        "Meridiano",
        "Full-stack Engineer",
        "2019–21"
      ],
      [
        "K",
        "Kyte",
        "Engineer, Platform",
        "2017–19"
      ]
    ],
    "projects": [
      [
        "P",
        "Pipeline Zero",
        "Declarative ingestion — YAML in, typed Parquet out."
      ],
      [
        "K",
        "Kernel CLI",
        "Scaffold, seed and tear down an environment in one command."
      ],
      [
        "S",
        "Sonda",
        "A trace sampler that keeps the spans which explain an outage."
      ]
    ]
  },
  "ai": {
    "reel": "AI engineer",
    "say": "AI engineer",
    "plate": "Fig. 2 — a network above the loss surface it descends",
    "bio": [
      "Hi, I’m Vinicius, a 🇧🇷 Brazilian <strong>AI engineer</strong> and builder, though most weeks that just means <strong>eval janitor</strong>. I love the early stage of a system, when the <strong>dataset</strong> is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.",
      "I currently build <strong>retrieval and ranking over 800k parts</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">A</i><span>Autodoc</span></a>, where I joined in 2023 and have helped shape the <strong>eval harness, its golden sets, and its release gates</strong> from the ground up. Most days I am still close to the work — <strong>writing Python, reading failure cases, and sweating the recall</strong>.",
      "Before Autodoc I worked on <strong>demand forecasting</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">N</i><span>Nexo Labs</span></a>, <strong>a pt-BR intent classifier</strong> for <a class=\"fav\" href=\"#\"><i class=\"chip\">M</i><span>Meridiano</span></a>, and <strong>NLP for legal text</strong> at a university lab.",
      "I recently designed and coded <a class=\"fav\" href=\"#\"><i class=\"chip\">R</i><span>Retriever</span></a>, <strong>an eval harness with drift alerts and per-commit scoring</strong>, and <a class=\"fav\" href=\"#\"><i class=\"chip\">V</i><span>Vozes</span></a>, <strong>an open Portuguese speech corpus of 120 hours</strong>. Small projects like these are my favourite excuse to learn new stuff and try things out.",
      "I’m a big <a class=\"fav\" href=\"#\"><i class=\"chip\">TL</i><span>Ted Lasso</span></a> fan, and the line that has stayed with me is “Be <button class=\"curiosity-trigger\" type=\"button\" role=\"switch\" aria-checked=\"false\" aria-label=\"Curious mode\" aria-controls=\"curiosity-overlay\"><span class=\"curiosity-word\">curious</span><span class=\"curiosity-switch-track\" aria-hidden=\"true\"><span class=\"curiosity-switch-thumb\"></span></span></button>, not judgmental.” It’s also a pretty good way to approach models, if you ask me."
    ],
    "work": [
      [
        "A",
        "Autodoc",
        "AI Engineer",
        "2024–"
      ],
      [
        "N",
        "Nexo Labs",
        "Machine Learning Engineer",
        "2022–24"
      ],
      [
        "U",
        "UFMG",
        "Research Assistant, NLP",
        "2021–22"
      ],
      [
        "K",
        "Kyte",
        "Data Scientist",
        "2019–21"
      ]
    ],
    "projects": [
      [
        "R",
        "Retriever",
        "Eval harness: golden sets, drift alerts, per-commit scoring."
      ],
      [
        "V",
        "Vozes",
        "Open pt-BR speech corpus, 120 hours, speaker balanced."
      ],
      [
        "P",
        "Pareto",
        "A prompt optimiser that trades tokens against measured accuracy."
      ]
    ]
  },
  "civil": {
    "reel": "Civil engineer",
    "say": "Civil engineer",
    "plate": "Fig. 3 — Warren truss bridge over the river, 52 m span",
    "bio": [
      "Hi, I’m Vinicius, a 🇧🇷 Brazilian <strong>civil engineer</strong> and builder, though most weeks that just means <strong>load-path pedant</strong>. I love the early stage of a project, when the <strong>site survey</strong> is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.",
      "I currently build <strong>mezzanines and rack structures</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">A</i><span>Autodoc</span></a>, where I joined in 2023 and have helped shape the <strong>load registry, its inspection cycle, and its sensor network</strong> from the ground up. Most days I am still close to the work — <strong>drawing reinforcement, reading strain data, and sweating the deflection</strong>.",
      "Before Autodoc I worked on <strong>nine mid-rise buildings</strong> at <a class=\"fav\" href=\"#\"><i class=\"chip\">M</i><span>Meridiano</span></a>, <strong>bridge rehabilitation plans</strong> for <a class=\"fav\" href=\"#\"><i class=\"chip\">D</i><span>DER-MG</span></a>, and <strong>a precast catalogue</strong> for a regional plant.",
      "I recently designed and instrumented <a class=\"fav\" href=\"#\"><i class=\"chip\">P</i><span>Ponte Viva</span></a>, <strong>a 52 metre span with strain telemetry and a public dashboard</strong>, and <a class=\"fav\" href=\"#\"><i class=\"chip\">C</i><span>Concreto</span></a>, <strong>a mix optimiser balancing strength, cost and carbon</strong>. Small projects like these are my favourite excuse to learn new stuff and try things out.",
      "I’m a big <a class=\"fav\" href=\"#\"><i class=\"chip\">TL</i><span>Ted Lasso</span></a> fan, and the line that has stayed with me is “Be <button class=\"curiosity-trigger\" type=\"button\" role=\"switch\" aria-checked=\"false\" aria-label=\"Curious mode\" aria-controls=\"curiosity-overlay\"><span class=\"curiosity-word\">curious</span><span class=\"curiosity-switch-track\" aria-hidden=\"true\"><span class=\"curiosity-switch-thumb\"></span></span></button>, not judgmental.” It’s also a pretty good way to approach structures, if you ask me."
    ],
    "work": [
      [
        "A",
        "Autodoc",
        "Facilities & Structures Lead",
        "2023–"
      ],
      [
        "M",
        "Meridiano",
        "Structural Engineer",
        "2019–23"
      ],
      [
        "D",
        "DER-MG",
        "Bridge Engineer",
        "2017–19"
      ],
      [
        "U",
        "UFMG",
        "Structures Lab Assistant",
        "2015–17"
      ]
    ],
    "projects": [
      [
        "P",
        "Ponte Viva",
        "Strain telemetry on a 52 m span, with a dashboard for the road agency."
      ],
      [
        "C",
        "Concreto",
        "A mix optimiser balancing strength, cost and carbon per cubic metre."
      ],
      [
        "G",
        "Carga",
        "A moving-load solver that draws influence lines while you drag."
      ]
    ]
  }
};

/** RPG-ish class cards. Not rendered by the current design — kept because an
 *  earlier iteration used them and they may come back. */
export const CLASSES: Record<RoleKey, ClassCard> = {
  "se": {
    "name": "Systems Smith",
    "lv": "LV 9 · backend",
    "flavor": "Forges the quiet parts. Immune to 3 a.m. pages.",
    "stats": [
      [
        "throughput",
        5
      ],
      [
        "latency",
        4
      ],
      [
        "chaos",
        4
      ]
    ]
  },
  "ai": {
    "name": "Model Wrangler",
    "lv": "LV 4 · applied ML",
    "flavor": "Trusts no demo without a golden set behind it.",
    "stats": [
      [
        "recall",
        5
      ],
      [
        "precision",
        4
      ],
      [
        "cost",
        3
      ]
    ]
  },
  "civil": {
    "name": "Loadbearer",
    "lv": "LV 9 · structures",
    "flavor": "Reads a crack the way others read a changelog.",
    "stats": [
      [
        "load path",
        5
      ],
      [
        "tolerance",
        4
      ],
      [
        "mud",
        3
      ]
    ]
  }
};

export const SIGIL: Record<RoleKey, string> = {
  "se": "<svg class=\"sig\" viewBox=\"0 0 120 44\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M60 5 86 14v16L60 39 34 30V14z\"/><path d=\"M60 5v10l26 -1M60 15 34 14M60 15v24\"/><path d=\"M24 12l-8 10 8 10M96 12l8 10-8 10\"/></svg>",
  "ai": "<svg class=\"sig\" viewBox=\"0 0 120 44\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" aria-hidden=\"true\"><circle cx=\"60\" cy=\"22\" r=\"5\"/><circle cx=\"31\" cy=\"10\" r=\"3\"/><circle cx=\"31\" cy=\"34\" r=\"3\"/><circle cx=\"89\" cy=\"10\" r=\"3\"/><circle cx=\"89\" cy=\"34\" r=\"3\"/><circle cx=\"60\" cy=\"5\" r=\"2.4\"/><circle cx=\"60\" cy=\"39\" r=\"2.4\"/><path d=\"M34 11l21 8M34 33l21-8M86 11 65 19M86 33 65 25M60 8v9M60 27v9\"/></svg>",
  "civil": "<svg class=\"sig\" viewBox=\"0 0 120 44\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M16 30h88M16 30l11-16 11 16 11-16 11 16 11-16 11 16 11-16 11 16\"/><path d=\"M27 14h66M20 30v8M100 30v8M14 38h12M94 38h12\"/></svg>"
};
