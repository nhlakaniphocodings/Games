// X — the sarcastic narrator. Context aware, brief, never blocking.

export interface NarratorContext {
  event: 'death' | 'complete' | 'hazard' | 'near' | 'start' | 'idle'
  deaths: number
  level: number
}

type Line = { at: number; lines: string[] }

const DEATH_LINES: Line[] = [
  { at: 1, lines: ['Unfortunate.', 'Oh. That happened.', 'Bold opening move.', 'You actually trusted that floor?', 'That was the tutorial, by the way.'] },
  { at: 2, lines: ['You remembered the trap, right?', 'So close. To nothing.', 'Again? Sure.', 'Noted: floors are optional.', 'Same jump. Same mistake.'] },
  { at: 3, lines: ['Three. A pattern emerges.', 'The trap is winning.', 'Maybe look before you leap.', 'You saw the hole. You still jumped.'] },
  { at: 4, lines: ['You are getting the hang of the dying part.', 'Confidence: unearned.', 'Interesting strategy. It failed.', 'That was almost impressive.'] },
  { at: 5, lines: ['Five. Halfway to double digits.', 'The wall says hello every time.', 'You could try the other direction.', 'Attempt five. Confidence remains high.'] },
  { at: 8, lines: ['I would offer advice, but you ignore it.', 'This is a lot of attempts.', 'The exit remains unmoved.', 'You learned absolutely nothing.'] },
  { at: 10, lines: ['Double digits. Impressive.', 'Ten deaths. The floor appreciates your loyalty.', 'Try jumping earlier. Or later. Or at all.', 'Attempt number 10. Confidence remains high.'] },
  { at: 15, lines: ['Fifteen. Should we take a break?', 'The trap has a family to feed, thank you.', 'You are really committing to this.', 'The exit sends its regards.'] },
  { at: 25, lines: ['This is becoming a relationship.', 'Twenty five. I am invested now.', 'The door is starting to feel bad for you.', 'The door was RIGHT THERE.'] },
  { at: 40, lines: ['Forty. We are past advice.', 'This is a lifestyle choice.', 'Have you considered a calmer game?', 'Attempt 40. Confidence remains high.'] },
  { at: 50, lines: ['We should probably talk.', 'Fifty deaths. I am not angry. I am disappointed.', 'The server has a room named after you.'] },
  { at: 75, lines: ['Seventy five. Someone check on them.', 'You are legendary. Not in a good way.', 'The trap sends its regards.'] },
  { at: 100, lines: ['One hundred. This is history.', 'They will name a bug after you.', 'I have run out of material. Keep going.'] },
]

const HAZARD_LINES = [
  'Excellent decision.',
  'The spikes thank you.',
  'Right into it. Confident.',
  'That was clearly dangerous.',
  'A bold embrace of danger.',
  'You saw the spikes. You chose the spikes.',
]

const NEAR_LINES = [
  'You were practically there.',
  'So close it counts as cruel.',
  'The exit saw you. It remembers.',
  'One tile. One tiny tile.',
  'Almost. Almost is nothing.',
]

const COMPLETE_LINES = [
  'Fine. You earned that one.',
  'Adequate. Genuinely.',
  'The trap is speechless.',
  'You may proceed. Smugly.',
  'Impressive. Do not let it go to your head.',
  'Cleared. The next one is worse.',
]

const START_LINES = [
  'This looks easy.',
  'Trust nothing.',
  'It is basically a straight line.',
  'Take your time. It will not help.',
  'Simple. Allegedly.',
]

function rngPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function bucketFor(deaths: number): Line {
  let chosen = DEATH_LINES[0]
  for (const line of DEATH_LINES) if (deaths >= line.at) chosen = line
  return chosen
}

export function narrate(ctx: NarratorContext): string {
  switch (ctx.event) {
    case 'death': {
      if (ctx.deaths === 1) return rngPick(DEATH_LINES[0].lines)
      return rngPick(bucketFor(ctx.deaths).lines)
    }
    case 'hazard':
      return rngPick(HAZARD_LINES)
    case 'near':
      return rngPick(NEAR_LINES)
    case 'complete':
      return rngPick(COMPLETE_LINES)
    case 'start':
      return rngPick(START_LINES)
    default:
      return ''
  }
}

export function finalWords(deaths: number): string {
  if (deaths === 0) return 'Flawless. Show-off.'
  if (deaths < 10) return 'Clean enough. Barely.'
  if (deaths < 30) return 'The traps remember you kindly.'
  if (deaths < 75) return 'You two have history now.'
  return 'You have suffered beautifully.'
}

export function levelIntro(level: number): string | null {
  const map: Record<number, string> = {
    1: 'Teach yourself the basics. Nothing can go wrong.',
    5: 'Halfway. The floor is now a suggestion.',
    10: 'Final level. It knows what you learned.',
  }
  return map[level] ?? null
}
