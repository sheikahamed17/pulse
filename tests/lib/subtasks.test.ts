import { describe, it, expect } from 'vitest'
import { groupTasks, subtaskProgress, rollupOps, visibleNodes, type TaskNode } from '@/lib/subtasks'
import type { TaskRow } from '@/lib/dexie'

const t = (over: Partial<TaskRow>): TaskRow => ({
  id: 'x', user_id: 'u1', title: 't', due_at: null, priority: 'medium', completed_at: null,
  source: 'manual', raw_input: null, recur_period: null, recur_interval: null,
  tags: [], project_id: null, parent_id: null, field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...over,
})

describe('groupTasks', () => {
  it('nests children under their parent, preserving order', () => {
    const nodes = groupTasks([
      t({ id: 'p' }), t({ id: 'c1', parent_id: 'p' }), t({ id: 'c2', parent_id: 'p' }), t({ id: 's' }),
    ])
    expect(nodes.map(n => n.id)).toEqual(['p', 's'])
    expect(nodes[0].children.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(nodes[1].children).toEqual([])
  })
  it('treats an orphan (missing parent) as top-level', () => {
    const nodes = groupTasks([t({ id: 'c', parent_id: 'gone' })])
    expect(nodes.map(n => n.id)).toEqual(['c'])
  })
})

describe('subtaskProgress', () => {
  it('null for a leaf; done/total otherwise', () => {
    expect(subtaskProgress({ ...t({ id: 'p' }), children: [] })).toBeNull()
    expect(subtaskProgress({ ...t({ id: 'p' }), children: [t({ completed_at: 'x' }), t({}), t({})] })).toEqual({ done: 1, total: 3 })
  })
})

describe('rollupOps', () => {
  const parent = t({ id: 'p' })
  it('all children complete + parent open → complete the parent', () => {
    expect(rollupOps(parent, [t({ completed_at: 'a' }), t({ completed_at: 'b' })], 'NOW')).toEqual({ completed_at: 'NOW' })
  })
  it('a child open + parent complete → reopen the parent', () => {
    expect(rollupOps(t({ id: 'p', completed_at: 'x' }), [t({ completed_at: 'a' }), t({})], 'NOW')).toEqual({ completed_at: null })
  })
  it('partial + parent already open → no change', () => {
    expect(rollupOps(parent, [t({ completed_at: 'a' }), t({})], 'NOW')).toBeNull()
  })
  it('no children → no change', () => {
    expect(rollupOps(parent, [], 'NOW')).toBeNull()
  })
})

describe('visibleNodes', () => {
  const nodes: TaskNode[] = [
    { ...t({ id: 'open1', project_id: 'p1', tags: ['a'] }), children: [] },
    { ...t({ id: 'done1', completed_at: 'x', project_id: 'p1' }), children: [] },
    { ...t({ id: 'open2', project_id: 'p2' }), children: [] },
  ]
  it('open filter keeps only open parents', () => {
    expect(visibleNodes(nodes, 'open', null, null).map(n => n.id)).toEqual(['open1', 'open2'])
  })
  it('completed filter keeps only completed parents', () => {
    expect(visibleNodes(nodes, 'completed', null, null).map(n => n.id)).toEqual(['done1'])
  })
  it('project + tag filter (all) narrows parents', () => {
    expect(visibleNodes(nodes, 'all', 'p1', 'a').map(n => n.id)).toEqual(['open1'])
  })
})
