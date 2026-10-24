<script lang="ts">
  import PageIcon from '../components/PageIcon.svelte';
  import { shortcuts } from '../shortcuts.svelte';
  import { importCalendar } from '../ics-import.svelte';
  import Icon from '../components/Icon.svelte';
  import AssignmentRow from '../ui/AssignmentRow.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import EventRow from '../ui/EventRow.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import MonthGrid from './MonthGrid.svelte';
  import WeekGrid from './WeekGrid.svelte';
  import { calendar, itemsByDay } from '../calendar.svelte';
  import { clock } from '../clock.svelte';
  import {
    formatTime,
    addDays,
    addMonths,
    formatMonth,
    fromMinutes,
    minutes,
    parseDate,
    startOfMonth,
    startOfWeek,
    toISODate,
  } from '../dates';
  import { planner } from '../planner.svelte';
  import { prefs, type CalendarMode } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';

  const modes: { value: CalendarMode; label: string }[] = [
    { value: 'month', label: 'Month' },
    { value: 'week', label: 'Week' },
  ];

  const weeks = $derived.by(() => {
    const first = startOfMonth(calendar.cursor);
    const start = startOfWeek(first, prefs.weekStart);
    // As many rows as the month needs (4–6), like a wall calendar.
    const nextMonth = addMonths(first, 1);
    const rows: string[][] = [];
    for (let day = start; day < nextMonth; day = addDays(day, 7)) {
      rows.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    }
    return rows;
  });
  const weekDays = $derived.by(() => {
    const start = startOfWeek(calendar.cursor, prefs.weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  });

  const title = $derived.by(() => {
    if (prefs.calendarMode === 'month') return formatMonth(calendar.cursor);
    const a = formatMonth(weekDays[0]);
    const b = formatMonth(weekDays[6]);
    if (a.month === b.month) return a;
    const short = (iso: string) => parseDate(iso).toLocaleDateString(undefined, { month: 'short' });
    return { month: `${short(weekDays[0])} – ${short(weekDays[6])}`, year: b.year };
  });

  const range = $derived(
    prefs.calendarMode === 'month'
      ? [startOfMonth(calendar.cursor), addDays(addMonths(startOfMonth(calendar.cursor), 1), -1)]
      : [weekDays[0], weekDays[6]],
  );
  const summary = $derived.by(() => {
    const days = itemsByDay(range[0], range[1]);
    const events = new Set<string>();
    let due = 0;
    for (const d of days.values()) {
      for (const o of [...d.allDay, ...d.timed]) events.add(o.key);
      due += d.due.filter((a) => a.status !== 'done').length;
    }
    const period = prefs.calendarMode === 'month' ? 'this month' : 'this week';
    if (!events.size && !due) return `Nothing scheduled ${period}`;
    const parts = [];
    if (events.size) parts.push(`${events.size} event${events.size === 1 ? '' : 's'}`);
    if (due) parts.push(`${due} assignment${due === 1 ? '' : 's'} due`);
    return parts.join(' · ');
  });

  // The selected day's agenda.
  const day = $derived(itemsByDay(calendar.selected, calendar.selected).get(calendar.selected));
  const dayPages = $derived(
    store.all
      .filter((p) => !p.deletedAt && p.kind !== 'database' && !store.isRow(p))
      .filter((p) => toISODate(new Date(p.createdAt)) === calendar.selected || toISODate(new Date(p.updatedAt)) === calendar.selected)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
  );
  const occurrencesForDay = $derived(day ? [...day.allDay, ...day.timed] : []);
  const isEmptyDay = $derived(!occurrencesForDay.length && !day?.due.length && !day?.rows.length && !dayPages.length);

  function step(dir: 1 | -1) {
    if (prefs.calendarMode === 'month') {
      calendar.cursor = addMonths(startOfMonth(calendar.cursor), dir);
    } else {
      calendar.cursor = addDays(calendar.cursor, dir * 7);
      calendar.selected = addDays(calendar.selected, dir * 7);
    }
  }

  function today() {
    calendar.cursor = clock.today;
    calendar.selected = clock.today;
  }

  function newEvent(date = calendar.selected, time = '09:00') {
    const end = Math.min(minutes(time) + 60, 23 * 60 + 59);
    planner.newEvent({ startDate: date, endDate: date, startTime: time, endTime: fromMinutes(end) });
  }

  function newMenu(e: MouseEvent) {
    ui.openMenuAt(
      e.currentTarget as Element,
      [
        { label: 'New Event', icon: 'calendar', action: () => newEvent() },
        { label: 'New Assignment', icon: 'assignment', action: () => planner.newAssignment({ dueDate: calendar.selected }) },
      ],
      { alignRight: true },
    );
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || ui.anyModalOpen || ui.menu) return;
    const id = shortcuts.match(e, ['calendarPrev', 'calendarNext', 'calendarToday']);
    if (!id) return;
    // A plain key belongs to whatever is being typed in.
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    if (id === 'calendarPrev') step(-1);
    else if (id === 'calendarNext') step(1);
    else today();
  }

  const selectedDate = $derived(parseDate(calendar.selected));
</script>

<svelte:window onkeydown={onKey} />

<div class="view wide cal">
  <header class="view-head">
    <div>
      <h1 class="view-title">{title.month} <span class="year">{title.year}</span></h1>
      <p class="view-sub">{summary}</p>
    </div>
    <div class="view-actions">
      <Segmented options={modes} value={prefs.calendarMode} onchange={(v) => (prefs.calendarMode = v)} label="Calendar view" />
      <div class="nav">
        <button class="icon-btn" onclick={() => step(-1)} data-tip={prefs.calendarMode === 'month' ? 'Previous month' : 'Previous week'} data-tip-key={shortcuts.label('calendarPrev')}>
          <Icon name="chevron-left" />
        </button>
        <button class="btn small today-btn" onclick={today} data-tip-key={shortcuts.label('calendarToday')} data-tip="Go to today">Today</button>
        <button class="icon-btn" onclick={() => step(1)} data-tip={prefs.calendarMode === 'month' ? 'Next month' : 'Next week'} data-tip-key={shortcuts.label('calendarNext')}>
          <Icon name="chevron-right" />
        </button>
      </div>
      <button class="btn raised import-btn" onclick={importCalendar} data-tip="Your class schedule from Canvas, Google Calendar or Outlook (.ics)"><Icon name="download" size={15} /> Import</button>
      <button class="btn primary" onclick={() => newEvent()}><Icon name="plus" size={15} stroke={2.2} /> New Event</button>
    </div>
  </header>

  {#if !planner.events.some((e) => !e.deletedAt)}
    <div class="first-run">
      <Icon name="calendar" size={18} />
      <div class="grow">
        <strong>Bring in your class schedule</strong>
        <span>In Canvas, Google Calendar or Outlook, export or download the calendar as an .ics file, then import it here. Classes, deadlines and repeats come along.</span>
      </div>
      <button class="btn primary" onclick={importCalendar}><Icon name="download" size={15} /> Import .ics</button>
      <button class="btn raised" onclick={() => newEvent()}>Add a class</button>
    </div>
  {/if}

  <div class="body" class:week={prefs.calendarMode === 'week'}>
    <div class="grid-wrap">
      {#if prefs.calendarMode === 'month'}
        <MonthGrid {weeks} month={calendar.cursor.slice(0, 7)} onnew={(d) => newEvent(d)} />
      {:else}
        {#key weekDays[0]}
          <WeekGrid days={weekDays} onnew={(d, t) => newEvent(d, t)} />
        {/key}
      {/if}
    </div>

    {#if prefs.calendarMode === 'month'}
      <aside class="panel" aria-label="Selected day">
        <div class="panel-head">
          <div>
            <div class="eyebrow">{calendar.selected === clock.today ? 'Today' : selectedDate.toLocaleDateString(undefined, { weekday: 'long' })}</div>
            <h2>{selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</h2>
          </div>
          <button class="icon-btn" onclick={newMenu} data-tip="Add to this day"><Icon name="plus" /></button>
        </div>

        {#if day?.due.length}
          <h3 class="group-title">Due</h3>
          <div class="group">
            {#each day.due as a (a.id)}
              <AssignmentRow {a} compact />
            {/each}
          </div>
        {/if}

        {#if occurrencesForDay.length}
          <h3 class="group-title">Events</h3>
          <div class="group">
            {#each occurrencesForDay as occ (occ.key)}
              <EventRow {occ} day={calendar.selected} />
            {/each}
          </div>
        {/if}

        {#if day?.rows.length}
          <h3 class="group-title">From Databases</h3>
          <div class="group">
            {#each day.rows as r (r.key)}
              {@const p = store.byId.get(r.row.id)}
              <button class="group-row page-row" onclick={() => store.open(r.row.id)}>
                <span class="page-icon">{#if p?.icon}<PageIcon icon={p.icon} />{:else}<span class="square" style:--c={r.color}></span>{/if}</span>
                <span class="page-title">{p?.title || 'Untitled'}</span>
                <span class="page-meta">{r.time ? `${formatTime(r.time)} · ` : ''}{store.byId.get(r.dbId)?.title || 'Database'}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if dayPages.length}
          <h3 class="group-title">Pages</h3>
          <div class="group">
            {#each dayPages as p (p.id)}
              <button class="group-row page-row" onclick={() => store.open(p.id)}>
                <span class="page-icon">{#if p.icon}<PageIcon icon={p.icon} />{:else}<Icon name="page" size={16} />{/if}</span>
                <span class="page-title">{p.title || 'Untitled'}</span>
                <span class="page-meta">{toISODate(new Date(p.createdAt)) === calendar.selected ? 'Created' : 'Edited'}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if isEmptyDay}
          <EmptyState compact icon="calendar" title="Nothing scheduled" text="Double-click a day to add an event.">
            <button class="btn small" onclick={() => newEvent()}>Event</button>
            <button class="btn small" onclick={() => planner.newAssignment({ dueDate: calendar.selected })}>Assignment</button>
          </EmptyState>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .cal {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 600px;
    padding-top: 36px;
    padding-bottom: 28px;
    padding-left: clamp(20px, calc(var(--pane-w, 100vw) * 0.04), 48px);
    padding-right: clamp(20px, calc(var(--pane-w, 100vw) * 0.04), 48px);
  }
  .year {
    font-weight: var(--fw-400);
    color: var(--text-3);
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .today-btn {
    background: var(--fill);
  }
  .first-run {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
    padding: 12px 16px;
    border-radius: var(--r-md);
    background: var(--bg-grouped);
    box-shadow: inset 0 0 0 1px var(--hairline);
    font-size: var(--fs-ui);
  }
  .first-run > :global(.icon) {
    flex: none;
    color: var(--text-2);
  }
  .first-run .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .first-run span {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .first-run .btn {
    flex: none;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 24px;
  }
  .grid-wrap {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .panel {
    flex: none;
    width: 292px;
    overflow-y: auto;
    margin-right: -6px;
    padding-right: 6px;
  }
  .panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0 0 4px 4px;
  }
  .panel-head h2 {
    margin: 2px 0 0;
    font-size: 20px;
    font-weight: var(--fw-650);
    letter-spacing: -0.018em;
  }
  .page-row {
    width: 100%;
    gap: 12px;
    min-height: 44px;
    padding: 6px 12px;
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .page-row:hover {
    background: var(--fill);
  }
  .page-row:first-child {
    border-top-left-radius: var(--r-md);
    border-top-right-radius: var(--r-md);
  }
  .page-row:last-child {
    border-bottom-left-radius: var(--r-md);
    border-bottom-right-radius: var(--r-md);
  }
  .page-icon {
    display: grid;
    place-items: center;
    width: 20px;
    font-size: 15px;
    color: var(--text-3);
  }
  .square {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--c);
  }
  .page-title {
    flex: 1;
    min-width: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .page-meta {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }

  /* The day panel goes under the month when the pane is narrow (pane-size.ts). */
  :global([data-below-820]) .cal:has(.body:not(.week)) {
    height: auto;
  }
  :global([data-below-820]) .body:not(.week) {
    flex-direction: column;
  }
  :global([data-below-820]) .body:not(.week) .grid-wrap {
    flex: none;
    height: 620px;
  }
  :global([data-below-820]) .panel {
    width: auto;
    overflow: visible;
    margin: 0;
    padding: 0 0 24px;
  }

</style>
