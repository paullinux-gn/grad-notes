<script lang="ts">
  import PageIcon from '../components/PageIcon.svelte';
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import Swatches from '../ui/Swatches.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Switch from '../ui/Switch.svelte';
  import Backlinks from '../ui/Backlinks.svelte';
  import TagRow from '../ui/TagRow.svelte';
  import { clock } from '../clock.svelte';
  import { colorVar, nextColor } from '../colors';
  import { addDays, diffDays, formatDate, fromMinutes, minutes, REPEAT_LABELS } from '../dates';
  import { openNotesPage } from '../item-actions';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import { relativeTime } from '../time';
  import { ui, type SheetState } from '../ui.svelte';
  import type { EventPatch, Repeat } from '../types';

  let { sheet }: { sheet: SheetState<EventPatch> } = $props();

  // The sheet is re-created per item, and closing clears the prop, so keep
  // what's needed after closing.
  // svelte-ignore state_referenced_locally
  const { id, onCreated, date } = sheet;
  /** The event being edited; becomes the standalone copy once one session is split off. */
  let targetId = $state(id);
  const existing = $derived(targetId ? planner.eventById.get(targetId) : undefined);
  const series = $derived(id ? planner.eventById.get(id) : undefined);
  /** Opened on one session of a repeating event. */
  const isSession = $derived(!!date && !!series && series.repeat !== 'none');
  let scope = $state<'this' | 'all'>('all');
  /** This session now lives on as its own event. */
  const split = $derived(targetId !== id);
  const editingSession = $derived(isSession && scope === 'this' && !split);
  const scopes = [
    { value: 'this' as const, label: 'This Event' },
    { value: 'all' as const, label: 'All Events' },
  ];
  // svelte-ignore state_referenced_locally
  let draft = $state({
    title: '',
    startDate: clock.today,
    startTime: '09:00' as string | null,
    endDate: clock.today,
    endTime: '10:00' as string | null,
    color: '',
    courseId: null as string | null,
    location: '',
    notes: '',
    repeat: 'none' as Repeat,
    repeatUntil: null as string | null,
    ...sheet.draft,
  });
  /** In "This Event" mode the form shows the session, not the series. */
  const form = $derived.by(() => {
    if (!existing) return draft;
    if (!editingSession || !date) return existing;
    return { ...existing, startDate: date, endDate: addDays(date, diffDays(existing.startDate, existing.endDate)) };
  });
  const course = $derived(form.courseId ? planner.courseById.get(form.courseId) : undefined);
  const page = $derived(existing?.pageId ? store.byId.get(existing.pageId) : undefined);
  /** The session whose class notes the sheet offers. */
  const sessionEvent = $derived(existing?.id);
  const sessionDate = $derived(existing && isSession ? (split ? existing.startDate : date) : undefined);
  const sessionNotes = $derived.by(() => {
    const pid = sessionEvent && sessionDate ? planner.sessionPage(sessionEvent, sessionDate) : null;
    return pid ? store.byId.get(pid) : undefined;
  });
  const allDay = $derived(form.startTime === null);
  const color = $derived(form.color ? colorVar(form.color) : planner.courseColor(form.courseId));

  let titleEl: HTMLInputElement;
  onMount(() => {
    if (!existing) titleEl.focus();
  });

  let detaching: Promise<void> | null = null;
  let queued: EventPatch = {};

  function set(patch: EventPatch, { typing = false } = {}) {
    if (!existing) {
      Object.assign(draft, patch);
      return;
    }
    if (!editingSession || !date) {
      planner.updateEvent(existing.id, patch, { immediate: !typing });
      return;
    }
    // The first change to one session splits it off the series; changes made
    // while that's under way follow it onto the copy.
    if (detaching) {
      Object.assign(queued, patch);
      return;
    }
    detaching = planner.detach(existing.id, date, patch).then((copy) => {
      if (copy) {
        targetId = copy.id;
        if (Object.keys(queued).length) planner.updateEvent(copy.id, queued, { immediate: true });
      }
      queued = {};
      detaching = null;
    });
  }

  /** Moving the start keeps the length of the event. */
  function setStartDate(date: string) {
    if (!date) return;
    const shift = diffDays(form.startDate, date);
    set({ startDate: date, endDate: addDays(form.endDate, shift) });
  }

  function setStartTime(time: string) {
    if (!time || !form.startTime) return;
    const length = diffDays(form.startDate, form.endDate) * 1440 + minutes(form.endTime ?? form.startTime) - minutes(form.startTime);
    const end = minutes(time) + Math.max(0, length);
    set({ startTime: time, endDate: addDays(form.startDate, Math.floor(end / 1440)), endTime: fromMinutes(end % 1440) });
  }

  function toggleAllDay() {
    if (allDay) set({ startTime: '09:00', endTime: '10:00' });
    else set({ startTime: null, endTime: null });
  }

  async function add() {
    ui.eventSheet = null;
    const ev = await planner.addEvent({ ...draft, title: draft.title.trim() || 'New Event' });
    if (ev) onCreated?.(ev.id);
  }

  /** Closing keeps a new event once it has a title. */
  function close() {
    if (!existing && draft.title.trim()) void add();
    else ui.eventSheet = null;
  }

  function repeatMenu(e: MouseEvent) {
    ui.openMenuAt(
      e.currentTarget as Element,
      (Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => ({
        label: REPEAT_LABELS[r],
        checked: form.repeat === r,
        action: () => set({ repeat: r, ...(r === 'none' ? { repeatUntil: null } : {}) }),
      })),
      { alignRight: true },
    );
  }

  function courseMenu(e: MouseEvent) {
    ui.openMenuAt(
      e.currentTarget as Element,
      [
        { label: 'No Course', icon: 'x', checked: !form.courseId, action: () => set({ courseId: null }) },
        ...(planner.courses.length ? [{ separator: true } as const] : []),
        ...planner.courses.map((c) => ({
          label: c.name || 'Untitled',
          dot: colorVar(c.color),
          checked: form.courseId === c.id,
          action: () => set({ courseId: c.id }),
        })),
        { separator: true },
        {
          label: 'New Course…',
          icon: 'plus',
          action: async () => {
            const res = await ui.prompt({
              title: 'New Course',
              placeholder: 'Course name',
              confirmLabel: 'Add Course',
              icon: 'book',
              color: nextColor(planner.courses.map((c) => c.color)),
            });
            if (!res) return;
            const c = await planner.addCourse(res.value, res.color);
            if (c) set({ courseId: c.id });
          },
        },
      ],
      { alignRight: true },
    );
  }

  async function notesPage() {
    if (existing) {
      await openNotesPage('event', existing.id);
      return;
    }
    ui.eventSheet = null;
    const ev = await planner.addEvent({ ...draft, title: draft.title.trim() || 'New Event' });
    if (!ev) return;
    onCreated?.(ev.id);
    await openNotesPage('event', ev.id);
  }
</script>

<Modal onclose={close} label={existing ? 'Event' : 'New Event'}>
  <header class="modal-head">
    <span class="swatch round" style:--c={color}></span>
    <input
      class="title"
      bind:this={titleEl}
      value={form.title}
      placeholder={existing ? 'Untitled' : 'New event'}
      spellcheck="false"
      oninput={(e) => set({ title: e.currentTarget.value }, { typing: true })}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (existing) close();
          else void add();
        }
      }}
    />
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="modal-body">
    <div class="group">
      {#if isSession && !split}
        <div class="group-row">
          <div class="row-label">
            Edit
            <small>{scope === 'this' ? `Only ${formatDate(date!, { weekday: 'long', month: 'short', day: 'numeric' })} changes` : 'Changes apply to every repeat'}</small>
          </div>
          <Segmented options={scopes} value={scope} onchange={(v) => (scope = v)} label="Edit which events" />
        </div>
      {/if}
      <div class="group-row">
        <div class="row-label">All-day</div>
        <Switch on={allDay} label="All-day" onchange={toggleAllDay} />
      </div>
      <div class="group-row">
        <div class="row-label">Starts</div>
        <div class="when">
          <label class="field date"><input type="date" value={form.startDate} aria-label="Start date" onchange={(e) => setStartDate(e.currentTarget.value)} /></label>
          {#if !allDay}
            <label class="field time"><input type="time" value={form.startTime} aria-label="Start time" onchange={(e) => setStartTime(e.currentTarget.value)} /></label>
          {/if}
        </div>
      </div>
      <div class="group-row">
        <div class="row-label">Ends</div>
        <div class="when">
          <label class="field date">
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              aria-label="End date"
              onchange={(e) => e.currentTarget.value && set({ endDate: e.currentTarget.value })}
            />
          </label>
          {#if !allDay}
            <label class="field time">
              <input type="time" value={form.endTime} aria-label="End time" onchange={(e) => e.currentTarget.value && set({ endTime: e.currentTarget.value })} />
            </label>
          {/if}
        </div>
      </div>
      {#if !editingSession}
        <div class="group-row">
          <div class="row-label">
            Repeat
            {#if form.repeat !== 'none' && !isSession}<small>Changes apply to every repeat</small>{/if}
          </div>
          <div class="when">
            {#if form.repeat !== 'none'}
              <label class="field date" data-tip="Repeat until (optional)">
                <input
                  type="date"
                  value={form.repeatUntil ?? ''}
                  min={form.startDate}
                  aria-label="Repeat until"
                  onchange={(e) => set({ repeatUntil: e.currentTarget.value || null })}
                />
              </label>
            {/if}
            <button class="btn small raised picker" onclick={repeatMenu}>
              <Icon name="repeat" size={13} stroke={2} />{REPEAT_LABELS[form.repeat]}<Icon name="chevron-down" size={12} stroke={2.2} />
            </button>
          </div>
        </div>
      {/if}
    </div>

    <h3 class="group-title">Details</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">Course</div>
        <button class="btn small raised picker" onclick={courseMenu}>
          {#if course}<span class="dot" style:--dot={colorVar(course.color)}></span>{course.name || 'Untitled'}{:else}<span class="muted">None</span>{/if}
          <Icon name="chevron-down" size={12} stroke={2.2} />
        </button>
      </div>
      <div class="group-row">
        <div class="row-label">Color</div>
        <Swatches value={form.color} onchange={(c) => set({ color: c })} auto={course ? 'Course color' : 'Accent color'} />
      </div>
      <div class="group-row">
        <div class="row-label">Location</div>
        <label class="field place">
          <Icon name="map-pin" size={14} stroke={2} />
          <input value={form.location} placeholder="Room, building or link" spellcheck="false" oninput={(e) => set({ location: e.currentTarget.value }, { typing: true })} />
        </label>
      </div>
    </div>

    {#if existing}
      <div class="group tags-group">
        <div class="group-row">
          <div class="row-label">Tags</div>
          <TagRow table="events" id={existing.id} compact />
        </div>
      </div>
    {/if}

    <h3 class="group-title">Notes</h3>
    <div class="group">
      <div class="group-row stack">
        <textarea class="field" value={form.notes} placeholder="Agenda, reading, things to bring…" oninput={(e) => set({ notes: e.currentTarget.value }, { typing: true })}></textarea>
      </div>
      {#if sessionDate}
        <div class="group-row">
          <div class="row-label">
            Notes for {formatDate(sessionDate, { weekday: 'short', month: 'short', day: 'numeric' })}
            <small>{sessionNotes ? 'Saved in the course’s notes' : 'A dated page for this class'}</small>
          </div>
          {#if sessionNotes}
            <button class="btn small raised" onclick={() => void planner.takeNotes(sessionEvent!, sessionDate)}>
              {#if sessionNotes.icon}<span>{sessionNotes.icon}</span>{:else}<Icon name="page" size={14} />{/if}
              <span class="page-name">{sessionNotes.title || 'Untitled'}</span>
              <Icon name="arrow-right" size={13} stroke={2} />
            </button>
          {:else}
            <button class="btn small raised" onclick={() => void planner.takeNotes(sessionEvent!, sessionDate)}><Icon name="note" size={14} /> Take Notes</button>
          {/if}
        </div>
      {/if}
      {#if !sessionDate || (scope === 'all' && !split)}
        <div class="group-row">
          <div class="row-label">
            {isSession ? 'Series notes page' : 'Notes page'}
            <small>{page && !page.deletedAt ? 'Meeting or lecture notes' : 'Take notes on a full page'}</small>
          </div>
          {#if page && !page.deletedAt}
            <button class="btn small raised" onclick={notesPage}>
              {#if page.icon}<span><PageIcon icon={page.icon} /></span>{:else}<Icon name="page" size={14} />{/if}
              <span class="page-name">{page.title || 'Untitled'}</span>
              <Icon name="arrow-right" size={13} stroke={2} />
            </button>
          {:else}
            <button class="btn small raised" onclick={notesPage}><Icon name="page-plus" size={14} /> Create Page</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if existing}<Backlinks id={existing.id} inSheet />{/if}
  </div>

  <footer class="modal-foot">
    {#if existing && isSession && !split}
      <span>{`Repeats ${REPEAT_LABELS[existing.repeat].toLowerCase()}${existing.repeatUntil ? ` until ${formatDate(existing.repeatUntil)}` : ''}`}</span>
      <div class="actions">
        <button class="btn small destructive" onclick={() => planner.skipDate(existing.id, date!)}>Delete This Event</button>
        <button class="btn small destructive" onclick={() => planner.trash('events', existing.id)}>Delete Series</button>
        <button class="btn small primary" onclick={close}>Done</button>
      </div>
    {:else if existing}
      <span>
        {#if split}Changed separately from the series{:else if form.repeat !== 'none'}{`Repeats ${REPEAT_LABELS[form.repeat].toLowerCase()}${form.repeatUntil ? ` until ${formatDate(form.repeatUntil)}` : ''}`}{:else}Created {relativeTime(existing.createdAt)}{/if}
      </span>
      <div class="actions">
        <button class="btn small destructive" onclick={() => planner.trash('events', existing.id)}>Move to Trash</button>
        <button class="btn small primary" onclick={close}>Done</button>
      </div>
    {:else}
      <span>Shows up in your calendar.</span>
      <div class="actions">
        <button class="btn small" onclick={() => (ui.eventSheet = null)}>Cancel</button>
        <button class="btn small primary" onclick={add}>Add Event</button>
      </div>
    {/if}
  </footer>
</Modal>

<style>
  .swatch {
    flex: none;
    /* 4 + 12 + 4 = the 20px check in the assignment sheet, so titles line up. */
    width: 12px;
    height: 12px;
    margin: 0 4px;
    border-radius: 50%;
    background: var(--c);
  }
  .title {
    flex: 1;
    min-width: 0;
    height: 36px;
    border: none;
    background: transparent;
    font-size: 17px;
    font-weight: var(--fw-650);
    letter-spacing: -0.016em;
    color: var(--text);
  }
  .tags-group {
    margin-top: 8px;
  }
  .when {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .field.date {
    width: 148px;
  }
  .field.time {
    width: 128px;
  }
  .field.place {
    width: 260px;
    color: var(--text-3);
  }
  .field.place input {
    color: var(--text);
  }
  .picker {
    gap: 8px;
  }
  .picker :global(svg) {
    color: var(--text-3);
  }
  .muted {
    color: var(--text-3);
  }
  .page-name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
