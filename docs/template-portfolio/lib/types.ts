export type RoleKey = 'se' | 'ai' | 'civil';

export interface Role {
  /** The words on the drum and in the wheel, e.g. "Software engineer". */
  reel: string;
  /** Announced to screen readers on change. */
  say: string;
  /** Caption under the 3D figure. */
  plate: string;
  /** Five paragraphs of HTML. Parallel across roles — see lib/morph.ts. */
  bio: string[];
  /** [chip, company, title, years] */
  work: [string, string, string, string][];
  /** [chip, name, description] */
  projects: [string, string, string][];
}

export interface ClassCard {
  name: string;
  lv: string;
  flavor: string;
  stats: [string, number][];
}

/** The seam between the DOM layer and the WebGL layer. Everything starts as a
 *  no-op, so the page works with WebGL unavailable. */
export interface Hooks {
  reel: (key: RoleKey) => void;
  plate: (key: RoleKey) => void;
  repaint: () => void;
  annot: (on: boolean) => void;
  curiousRelayout: () => void;
  isCurious: () => boolean;
}
