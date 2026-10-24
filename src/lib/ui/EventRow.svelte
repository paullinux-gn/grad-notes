<script lang="ts">
  /** One event in a grouped list: colour bar, title, time and place. */
  import Icon from '../components/Icon.svelte';
  import { formatDate, formatTime, relativeDay } from '../dates';
  import { clock } from '../clock.svelte';
  import { eventMenuItems } from '../item-actions';
  import { planner } from '../planner.svelte';
  import { ui } from '../ui.svelte';
  import type { Occurrence } from '../dates';

  let {
    occ,
    day,
    showDate = false,
    series = false,
  }: {
    occ: Occurrence;
    day?: string;
    showDate?: boolean;
    /** Stands for the whole event, not one session of it. */
    series?: boolean;
  } = $props();

  const e = $derived(occ.event);
  const when = $derived.by(() => {
    if (!e.startTime) {
      return occ.start === occ.end ? 'All day' : `${formatDate(occ.start)} – ${formatDate(occ.end)}`;
    }
    // On a day in the middle of a multi-day event, show how it continues.
    if (day && day !== occ.start && day !== occ.end) return 'All day';
    const start = day && day !== occ.start ? 'Until' : formatTime(e.startTime);
    if (day && day !== occ.start) return `${start} ${formatTime(e.endTime ?? e.startTime)}`;
    if (occ.end !== occ.start) return `${start} – ${formatDate(occ.end)}`;
    return e.endTime && e.endTime !== e.startTime ? `${start} – ${formatTime(e.endTime)}` : start;
  });

  let menuOpen = $state(false);
  function menu(ev: MouseEvent) {
    ev.preventDefault();
    menuOpen = true;
    ui.openMenu({ x: ev.clientX, y: ev.clientY, items: eventMenuItems(e.id, date), onClose: () => (menuOpen = false) });
  }

  /** The session this row is, or none for a repeating event as a whole. */
  const date = $derived(series && e.repeat !== 'none' ? undefined : occ.start);
  const notes = $derived(date ? planner.sessionPage(e.id, date) : null);
</script>

<div
  class="group-row e-row"
  class:menu-open={menuOpen}
  role="button"
  tabindex="0"
  onclick={() => planner.openEvent(e.id, date)}
  onkeydown={(ev) => ev.target === ev.currentTarget && ev.key === 'Enter' && planner.openEvent(e.id, date)}
  oncontextmenu={menu}
>
  <span class="bar round" style:--c={planner.eventColor(e)}></span>
  <div class="main">
    <span class="title">{e.title || 'New Event'}</span>
    <span class="meta">
      {#if showDate}<span>{relativeDay(occ.start, clock.today)}</span>{/if}
      <span>{when}</span>
      {#if e.location}<span class="bit"><Icon name="map-pin" size={12} stroke={2.2} />{e.location}</span>{/if}
      {#if e.repeat !== 'none'}<span class="bit" data-tip="Repeats"><Icon name="repeat" size={12} stroke={2.2} /></span>{/if}
    </span>
  </div>
  {#if date}
    <button
      class="icon-btn notes"
      class:has={notes}
      onclick={(ev) => {
        ev.stopPropagation();
        void planner.takeNotes(e.id, date);
      }}
      data-tip={notes ? 'Open notes' : 'Take notes'}
      aria-label={notes ? 'Open notes' : 'Take notes'}
    >
      <Icon name="note" size={15} />
    </button>
  {/if}
</div>

<style>
  .e-row {
    gap: 12px;
    min-height: 48px;
    padding: 8px 12px;
    cursor: default;
    outline: none;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .e-row:hover,
  .e-row.menu-open {
    background: var(--fill);
  }
  .e-row:first-child {
    border-top-left-radius: var(--r-md);
    border-top-right-radius: var(--r-md);
  }
  .e-row:last-child {
    border-bottom-left-radius: var(--r-md);
    border-bottom-right-radius: var(--r-md);
  }
  .e-row:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--focus);
  }
  .e-row + :global(.e-row)::before {
    left: 30px;
  }
  .bar {
    flex: none;
    align-self: stretch;
    width: 4px;
    margin: 2px 2px 2px 2px;
    border-radius: 2px;
    background: var(--c);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-size: var(--fs-body-ui);
    line-height: 20px;
    font-weight: var(--fw-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--fs-footnote);
    line-height: 16px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
  }
  .bit {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bit :global(svg) {
    flex: none;
  }
  /* Shown on hover, and always once the session has notes. */
  .notes {
    flex: none;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .notes.has {
    opacity: 1;
    color: var(--accent);
  }
  .e-row:hover .notes,
  .e-row:focus-within .notes,
  .e-row.menu-open .notes {
    opacity: 1;
  }
</style>
