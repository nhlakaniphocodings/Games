export type Game = {
  slug: string
  title: string
  description: string
  category: string
  accent: string
  number: string
}

export const games: Game[] = [
  {
    slug: 'x-devil',
    title: 'X Devil',
    description: 'Reach the door. The floor, the walls and the door itself have other plans.',
    category: 'Rage Platformer',
    accent: '#ff0000',
    number: '01',
  },
  {
    slug: 'gravity-flip',
    title: 'Gravity Flip',
    description: 'The floor is wherever you least expect it. Flip to survive the ceiling.',
    category: 'Gravity Platformer',
    accent: '#0066ff',
    number: '02',
  },
  {
    slug: 'liar-ui',
    title: 'Liar UI',
    description: 'The level is lying to you. So is the interface. Trust neither.',
    category: 'Puzzle Platformer',
    accent: '#0066ff',
    number: '03',
  },
  {
    slug: 'control-chaos',
    title: 'Control Chaos',
    description: 'Your instincts are the enemy. Adapt before the level does.',
    category: 'Reflex Platformer',
    accent: '#0066ff',
    number: '04',
  },
  {
    slug: 'invisible-path',
    title: 'Invisible Path',
    description: 'Remember what you saw. The route only exists for a moment.',
    category: 'Memory Platformer',
    accent: '#bdbdbd',
    number: '05',
  },
  {
    slug: 'rhythm-betrayer',
    title: 'Rhythm Betrayer',
    description: 'Trust the beat. Then question it. Then regret trusting it.',
    category: 'Rhythm Platformer',
    accent: '#0066ff',
    number: '06',
  },
  {
    slug: 'mirror-twins',
    title: 'Mirror Twins',
    description: 'Two characters, one set of controls. Help one, doom the other.',
    category: 'Puzzle Platformer',
    accent: '#bdbdbd',
    number: '07',
  },
  {
    slug: 'one-screen-boss',
    title: 'One Screen Boss',
    description: 'Sixty seconds of suffering on a single screen. Survive it.',
    category: 'Survival',
    accent: '#ff0000',
    number: '08',
  },
  {
    slug: 'shrinking-world',
    title: 'Shrinking World',
    description: 'The level is running out of space. Move before it closes.',
    category: 'Pressure Platformer',
    accent: '#0066ff',
    number: '09',
  },
  {
    slug: 'x-devil-finale',
    title: 'X Devil: The Finale',
    description: 'Everything you learned, tested at once. Including the fake ending.',
    category: 'Final Challenge',
    accent: '#ff0000',
    number: '10',
  },
]

export function getGame(slug: string) {
  return games.find((game) => game.slug === slug)
}
