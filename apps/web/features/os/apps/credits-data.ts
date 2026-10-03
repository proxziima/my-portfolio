export interface CreditSection {
  title: string
  rows: [who: string, what: string][]
}

/** The reference's sections, with the people whose models and sounds this scene actually uses. */
export const CREDITS = (name: string): CreditSection[] => [
  { title: 'Engineering & Design', rows: [[name, 'All']] },
  {
    title: 'Modeling & Texturing',
    rows: [
      ['Henry Heffernan', 'Desk models & baked textures'],
      ['Mickael Boitte', 'Computer model'],
      ['Sean Nicolas', 'Environment models'],
    ],
  },
  {
    title: 'Sound Design',
    rows: [
      ['Henry Heffernan', 'Mouse & keyboard foley'],
      ['Sound Cassette', 'Office ambience'],
    ],
  },
  {
    title: 'Built with',
    rows: [
      ['three.js', 'Scene'],
      ['Next & React', 'Site & OS'],
      ['Payload', 'Content'],
    ],
  },
  {
    title: 'Inspiration',
    rows: [
      ['Henry Heffernan', 'henryheffernan.com'],
      ['Bruno Simon', 'Three.js Journey'],
    ],
  },
]

/** The section after `index`, wrapping to the first. */
export const nextSection = (index: number, length: number): number => (length === 0 ? 0 : (index + 1) % length)
