import { describe, it, expect } from 'vitest'
import { addTag, filterTasks } from '@/lib/task-org'
import type { TaskRow } from '@/lib/dexie'

const t = (over: Partial<TaskRow>): TaskRow => ({
  id: 'x', user_id: 'u1', title: 't', due_at: null, priority: 'medium', completed_at: null,
  source: 'manual', raw_input: null, recur_period: null, recur_interval: null,
  tags: [], project_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over,
})

describe('addTag', () => {
  it('trims, dedups, drops empty', () => {
    expect(addTag(['a'], '  b ')).toEqual(['a', 'b'])
    expect(addTag(['a'], 'a')).toEqual(['a'])
    expect(addTag(['a'], '   ')).toEqual(['a'])
  })
})

describe('filterTasks', () => {
  const tasks = [
    t({ id: '1', tags: ['finance'], project_id: 'p1' }),
    t({ id: '2', tags: ['home'], project_id: 'p1' }),
    t({ id: '3', tags: ['finance'], project_id: 'p2' }),
    t({ id: '4', tags: [], project_id: null }),
  ]
  it('null filters pass everything through', () => {
    expect(filterTasks(tasks, { projectId: null, tag: null }).map(x => x.id)).toEqual(['1', '2', '3', '4'])
  })
  it('filters by project', () => {
    expect(filterTasks(tasks, { projectId: 'p1', tag: null }).map(x => x.id)).toEqual(['1', '2'])
  })
  it('filters by tag', () => {
    expect(filterTasks(tasks, { projectId: null, tag: 'finance' }).map(x => x.id)).toEqual(['1', '3'])
  })
  it('combines project AND tag', () => {
    expect(filterTasks(tasks, { projectId: 'p1', tag: 'finance' }).map(x => x.id)).toEqual(['1'])
  })
})
