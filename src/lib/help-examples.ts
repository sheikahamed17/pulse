export type HelpExample = {
  label: string
  prompt: string
  domain: 'money' | 'task' | 'learning' | 'note' | 'ask'
}

export const HELP_EXAMPLES: HelpExample[] = [
  {
    label: 'Log a spend',
    prompt: 'spent 200 on lunch',
    domain: 'money',
  },
  {
    label: 'Log an income',
    prompt: 'earned 5000 from freelance work',
    domain: 'money',
  },
  {
    label: 'Add a reminder',
    prompt: 'remind me to call mom tomorrow',
    domain: 'task',
  },
  {
    label: 'Log a learning',
    prompt: 'I learned that HLCs order events without clocks',
    domain: 'learning',
  },
  {
    label: 'Keep a note',
    prompt: 'note: wifi password is hunter2',
    domain: 'note',
  },
  {
    label: 'Check spending',
    prompt: 'how much did I spend on food this month?',
    domain: 'ask',
  },
  {
    label: 'Check tasks',
    prompt: "what's overdue?",
    domain: 'ask',
  },
]

export function examplesByDomain(domain: HelpExample['domain']): HelpExample[] {
  return HELP_EXAMPLES.filter(ex => ex.domain === domain)
}
