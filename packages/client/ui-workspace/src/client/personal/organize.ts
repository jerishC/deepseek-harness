/**
 * Personal session organization: done/unfinished marks and tags.
 * Lives in localStorage and mirrors to the tools manager when the page is
 * the local DSH web UI, so a weekly upstream rebase does not drop it.
 */
import { useSyncExternalStore } from 'react'

/** Explicit completion mark. Unmarked sessions stay in the full list only. */
export type MarkStatus = 'done' | 'unfinished'

/** A user-created label that can be attached to any session. */
export interface PersonalTag {
  id: string
  name: string
  color: string
}

/** Persisted organize document. */
export interface OrganizeState {
  updatedAt: number
  marks: Record<string, MarkStatus>
  tags: PersonalTag[]
  sessionTags: Record<string, string[]>
}

const STORAGE_KEY = 'dsh.personal.organize.v1'
const REMOTE_URL = 'http://127.0.0.1:8899/api/dsh-organize'
const TAG_NAME_MAX = 40

/** Palette offered when creating a tag. */
export const TAG_COLORS = ['#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#fb7185', '#94a3b8']

const listeners = new Set<() => void>()
let state: OrganizeState = readLocal()
let pushTimer: number | undefined

function emptyState(): OrganizeState {
  return { updatedAt: 0, marks: {}, tags: [], sessionTags: {} }
}

function isMark(value: unknown): value is MarkStatus {
  return value === 'done' || value === 'unfinished'
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/** Drop malformed records instead of throwing the sidebar. */
export function normalizeOrganize(value: unknown): OrganizeState | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const marks: Record<string, MarkStatus> = {}
  if (raw.marks !== null && typeof raw.marks === 'object') {
    for (const [id, status] of Object.entries(raw.marks as Record<string, unknown>)) {
      if (isMark(status)) marks[id] = status
    }
  }
  const tags: PersonalTag[] = []
  if (Array.isArray(raw.tags)) {
    for (const item of raw.tags) {
      if (item === null || typeof item !== 'object') continue
      const tag = item as Record<string, unknown>
      if (typeof tag.id !== 'string' || typeof tag.name !== 'string' || !isColor(tag.color)) continue
      const name = tag.name.trim().slice(0, TAG_NAME_MAX)
      if (name === '') continue
      tags.push({ id: tag.id, name, color: tag.color })
    }
  }
  const known = new Set(tags.map(tag => tag.id))
  const sessionTags: Record<string, string[]> = {}
  if (raw.sessionTags !== null && typeof raw.sessionTags === 'object') {
    for (const [id, list] of Object.entries(raw.sessionTags as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const ids = list.filter((tagId): tagId is string => typeof tagId === 'string' && known.has(tagId))
      if (ids.length > 0) sessionTags[id] = [...new Set(ids)]
    }
  }
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0
  return { updatedAt, marks, tags, sessionTags }
}

function readLocal(): OrganizeState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined || raw === '') return emptyState()
    return normalizeOrganize(JSON.parse(raw)) ?? emptyState()
  } catch {
    return emptyState()
  }
}

function writeLocal(next: OrganizeState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode or a full quota keeps the in-memory copy for this tab.
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function canSyncRemote(): boolean {
  return typeof window !== 'undefined'
    && window.location.hostname === '127.0.0.1'
    && window.location.port === '3080'
}

function commit(next: Omit<OrganizeState, 'updatedAt'>): void {
  state = { ...next, updatedAt: Date.now() }
  writeLocal(state)
  emit()
  schedulePush()
}

function schedulePush(): void {
  if (!canSyncRemote()) return
  if (pushTimer !== undefined) window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => { void pushRemote() }, 400)
}

async function pushRemote(): Promise<void> {
  const snapshot = state
  try {
    await fetch(REMOTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
  } catch {
    // The tools manager can be down; localStorage still holds the document.
  }
}

async function pullRemote(): Promise<void> {
  if (!canSyncRemote()) return
  try {
    const response = await fetch(REMOTE_URL)
    if (!response.ok) return
    const remote = normalizeOrganize(await response.json())
    if (remote === undefined) return
    if (remote.updatedAt > state.updatedAt) {
      state = remote
      writeLocal(state)
      emit()
      return
    }
    if (state.updatedAt > remote.updatedAt) void pushRemote()
  } catch {
    // Same fallback as push: keep the browser copy.
  }
}

void pullRemote()

/** Current document. Identity changes on every commit. */
export function getOrganize(): OrganizeState {
  return state
}

/** Subscribe to organize commits. */
export function subscribeOrganize(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** React binding over the organize document. */
export function useOrganize(): OrganizeState {
  return useSyncExternalStore(subscribeOrganize, getOrganize, getOrganize)
}

/** Mark a session finished or still open. Repeating the same mark clears it. */
export function setMark(sessionId: string, status: MarkStatus): void {
  const marks: Record<string, MarkStatus> = {}
  for (const [id, value] of Object.entries(state.marks)) {
    if (id !== sessionId) marks[id] = value
  }
  if (state.marks[sessionId] !== status) marks[sessionId] = status
  commit({ marks, tags: state.tags, sessionTags: state.sessionTags })
}

/** Create a tag, or return the existing one when the name is already used. */
export function createTag(name: string, color: string): PersonalTag | undefined {
  const trimmed = name.trim().slice(0, TAG_NAME_MAX)
  if (trimmed === '' || !isColor(color)) return undefined
  const existing = state.tags.find(tag => tag.name === trimmed)
  if (existing !== undefined) return existing
  const tag: PersonalTag = {
    id: `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    color,
  }
  commit({ marks: state.marks, tags: [...state.tags, tag], sessionTags: state.sessionTags })
  return tag
}

/** Remove a tag and every session attachment that pointed at it. */
export function deleteTag(tagId: string): void {
  const sessionTags: Record<string, string[]> = {}
  for (const [sessionId, ids] of Object.entries(state.sessionTags)) {
    const next = ids.filter(id => id !== tagId)
    if (next.length > 0) sessionTags[sessionId] = next
  }
  commit({
    marks: state.marks,
    tags: state.tags.filter(tag => tag.id !== tagId),
    sessionTags,
  })
}

/** Attach or detach one tag on one session. */
export function toggleSessionTag(sessionId: string, tagId: string): void {
  if (!state.tags.some(tag => tag.id === tagId)) return
  const current = state.sessionTags[sessionId] ?? []
  const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
  const sessionTags: Record<string, string[]> = {}
  for (const [id, ids] of Object.entries(state.sessionTags)) {
    if (id !== sessionId) sessionTags[id] = ids
  }
  if (next.length > 0) sessionTags[sessionId] = next
  commit({ marks: state.marks, tags: state.tags, sessionTags })
}

type TagRequest = (sessionId: string) => void
let tagRequest: TagRequest | undefined

/** Browser root installs the handler that opens the tag window for one session. */
export function setTagRequestHandler(handler: TagRequest | undefined): void {
  tagRequest = handler
}

/** Row menu asks the browser root to open the tag window. */
export function requestSessionTags(sessionId: string): void {
  tagRequest?.(sessionId)
}
