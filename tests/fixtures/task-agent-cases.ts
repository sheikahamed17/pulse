import type { TaskAgentResponse } from '@/lib/agents/schemas/task-agent-response'

export type TaskCase = {
  id: string
  text: string
  bucket: 'happy' | 'priority' | 'date' | 'no-due-date' | 'failure'
  expect: Partial<TaskAgentResponse>
}

// Fixed reference time for deterministic date math in tests.
// 2026-06-18T14:30:00.000Z = Thursday, June 18, 2026 — 20:00 IST (Asia/Kolkata).
export const TEST_NOW_ISO = '2026-06-18T14:30:00.000Z'
export const TEST_TZ = 'Asia/Kolkata'

export const TASK_CASES: TaskCase[] = [
  // ----- happy path (8) -----
  { id: 'h-01', bucket: 'happy', text: 'remind me to call mom tomorrow at 3pm',
    expect: { title: 'Call mom', priority: 'medium' } },
  { id: 'h-02', bucket: 'happy', text: 'I need to file taxes by Friday',
    expect: { title: 'File taxes', priority: 'medium' } },
  { id: 'h-03', bucket: 'happy', text: 'add task: review the PR',
    expect: { title: 'Review the PR', priority: 'medium' } },
  { id: 'h-04', bucket: 'happy', text: 'todo: groceries this weekend',
    expect: { title: 'Groceries', priority: 'medium' } },
  { id: 'h-05', bucket: 'happy', text: 'remember to drink water',
    expect: { title: 'Drink water', priority: 'medium', due_at: null } },
  { id: 'h-06', bucket: 'happy', text: 'remind me to pay the electricity bill',
    expect: { title: 'Pay electricity bill', priority: 'medium', due_at: null } },
  { id: 'h-07', bucket: 'happy', text: 'I should call the doctor sometime',
    expect: { title: 'Call the doctor', priority: 'medium' } },
  { id: 'h-08', bucket: 'happy', text: 'add: pick up dry cleaning',
    expect: { title: 'Pick up dry cleaning', priority: 'medium', due_at: null } },

  // ----- priority cues (6) -----
  { id: 'p-01', bucket: 'priority', text: 'urgent: call the doctor today',
    expect: { title: 'Call the doctor', priority: 'high' } },
  { id: 'p-02', bucket: 'priority', text: 'asap: review the deploy PR',
    expect: { title: 'Review deploy PR', priority: 'high' } },
  { id: 'p-03', bucket: 'priority', text: 'important: file the tax extension',
    expect: { priority: 'high' } },
  { id: 'p-04', bucket: 'priority', text: 'someday: clean the garage',
    expect: { title: 'Clean the garage', priority: 'low' } },
  { id: 'p-05', bucket: 'priority', text: 'low priority: alphabetize the bookshelf',
    expect: { priority: 'low' } },
  { id: 'p-06', bucket: 'priority', text: 'no rush, but research a new laptop',
    expect: { priority: 'low' } },

  // ----- date parsing (8) -----
  { id: 'd-01', bucket: 'date', text: 'remind me to vote next Tuesday',
    expect: { title: 'Vote', priority: 'medium' } /* due_at: next Tuesday morning */ },
  { id: 'd-02', bucket: 'date', text: 'remind me to take meds at 9am',
    expect: { title: 'Take meds', priority: 'medium' } /* due_at: today/tomorrow 9am */ },
  { id: 'd-03', bucket: 'date', text: 'remind me to stretch in 2 hours',
    expect: { title: 'Stretch', priority: 'medium' } /* due_at: now+2h */ },
  { id: 'd-04', bucket: 'date', text: 'I need to submit the report by end of month',
    expect: { title: 'Submit the report', priority: 'medium' } /* due_at: last day of month */ },
  { id: 'd-05', bucket: 'date', text: 'reminder: pay rent on the 1st',
    expect: { title: 'Pay rent', priority: 'medium' } /* due_at: 1st of next month */ },
  { id: 'd-06', bucket: 'date', text: 'remind me to leave at 8pm tonight',
    expect: { title: 'Leave', priority: 'medium' } /* due_at: today 20:00 local */ },
  { id: 'd-07', bucket: 'date', text: 'remind me to renew passport next month',
    expect: { title: 'Renew passport', priority: 'medium' } /* due_at: ~30 days out */ },
  { id: 'd-08', bucket: 'date', text: 'remind me about the meeting on Friday at 2pm',
    expect: { title: 'Meeting', priority: 'medium' } /* due_at: upcoming Friday 14:00 local */ },

  // ----- no-due-date (3) -----
  { id: 'n-01', bucket: 'no-due-date', text: 'remind me to call mom',
    expect: { title: 'Call mom', due_at: null, priority: 'medium' } },
  { id: 'n-02', bucket: 'no-due-date', text: 'todo: research a new gym',
    expect: { title: 'Research a new gym', due_at: null, priority: 'medium' } },
  { id: 'n-03', bucket: 'no-due-date', text: 'I need to organize my desk',
    expect: { title: 'Organize my desk', due_at: null, priority: 'medium' } },

  // ----- failures (5) -----
  { id: 'f-01', bucket: 'failure', text: '',
    expect: { title: 'untitled', due_at: null, priority: 'medium' } },
  { id: 'f-02', bucket: 'failure', text: 'asdfgh qwerty',
    expect: { title: 'untitled', due_at: null, priority: 'medium' } },
  { id: 'f-03', bucket: 'failure', text: 'hi there',
    expect: { title: 'untitled', priority: 'medium' } /* should be Router-rejected as chat; tested for robustness */ },
  { id: 'f-04', bucket: 'failure', text: 'show me my tasks',
    expect: { title: 'untitled', priority: 'medium' } /* should be Router-rejected as query_task; tested for robustness */ },
  { id: 'f-05', bucket: 'failure', text: 'thanks',
    expect: { title: 'untitled', priority: 'medium' } },
]
