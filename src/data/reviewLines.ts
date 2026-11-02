// Sample lines for the visual review build. Each line picks one of the character's expressions.
export const REVIEW_LINES: Record<string, { text: string; expr: number; patience: number; suspicion: number }[]> = {
  kell: [
    { text: "Shift C starts in two hours. Just tell me what it's worth.", expr: 0, patience: 4, suspicion: 1 },
    { text: "Don't look at me like that. I'm not here for charity.", expr: 1, patience: 3, suspicion: 2 },
    { text: 'Found it in the slag at Pit 4. That\'s all you need to know.', expr: 2, patience: 3, suspicion: 3 },
    { text: "And the hand's been dead since Tuesday. You fix those?", expr: 3, patience: 4, suspicion: 1 },
  ],
  voss: [
    { text: 'Lovely little shop. Shame if it got cold in here.', expr: 0, patience: 6, suspicion: 0 },
    { text: 'Rent falls due on day five. I am told I am very punctual.', expr: 1, patience: 6, suspicion: 0 },
    { text: 'One hundred and forty. Not one credit less.', expr: 2, patience: 6, suspicion: 0 },
    { text: 'Do count it twice. I always do.', expr: 3, patience: 6, suspicion: 0 },
  ],
};

export const TERMINAL_FEED = [
  '> K-NET NEWS',
  'QUOTA UP 12%',
  'PIT 4 SEALED.',
  'NO CASUALTY',
  'CURFEW 22:00',
  '> 1 NEW MSG',
  'FROM: ??',
  "DON'T BUY",
  'PIT 4 SHARDS',
  'THEY COUNT',
  'EVERY ONE.',
  '> HALCYON',
  'REPORT VEL',
  'REWARD 50 CR',
];
