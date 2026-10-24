<script lang="ts">
  /**
   * A link to a page, assignment, event or file inside a page. Pages show as
   * an underlined title; assignments carry a live check and due date.
   */
  import { split } from '../split.svelte';
  import PageIcon from '../components/PageIcon.svelte';
  import Icon from '../components/Icon.svelte';
  import StatusCheck from '../ui/StatusCheck.svelte';
  import { clock } from '../clock.svelte';
  import { dueState, formatDate, formatDue, formatTime } from '../dates';
  import { library } from '../library.svelte';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import FileTile from '../ui/FileTile.svelte';

  type ChipKind = 'page' | 'assignment' | 'event' | 'file';

  let {
    id,
    kind = 'page',
    block = false,
    date,
  }: { id: string; kind?: ChipKind; block?: boolean; /** One session of an event. */ date?: string } = $props();

  const page = $derived(kind === 'page' ? store.byId.get(id) : undefined);
  const assignment = $derived(kind === 'assignment' ? planner.assignmentById.get(id) : undefined);
  const event = $derived(kind === 'event' ? planner.eventById.get(id) : undefined);
  const file = $derived(kind === 'file' ? library.byId.get(id) : undefined);
  const item = $derived(page ?? assignment ?? event ?? file);
  const missing = $derived(!item || !!item.deletedAt);
  const title = $derived(
    missing
      ? `Deleted ${kind}`
      : (page?.title ?? assignment?.title ?? event?.title ?? file?.name) || 'Untitled',
  );
  const urgency = $derived(assignment ? dueState(assignment, clock.today, clock.time) : 'none');

  function open(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (missing) return;
    if (kind === 'page') {
      // Alt+click opens the page beside this one.
      if ((e as MouseEvent).altKey) split.show(id);
      else store.open(id);
    }
    else if (kind === 'assignment') planner.openAssignment(id);
    else if (kind === 'event') planner.openEvent(id, date);
    else library.preview(id);
  }
</script>

<span
  class="chip {kind}"
  class:block
  class:missing
  role="link"
  tabindex="-1"
  onclick={open}
  onkeydown={(e) => e.key === 'Enter' && open(e)}
>
  {#if assignment && !missing}
    <span class="chip-icon check">
      <StatusCheck
        done={assignment.status === 'done'}
        color={planner.courseColor(assignment.courseId)}
        size={14}
        label={assignment.status === 'done' ? 'Mark as not done' : 'Mark as done'}
        ontoggle={() => planner.toggleDone(id)}
      />
    </span>
  {:else if file && !missing}
    <span class="chip-icon"><FileTile {file} size={block ? 22 : 16} thumb={false} /></span>
  {:else}
    <span class="chip-icon" style:color={event && !missing ? planner.eventColor(event) : undefined}>
      {#if page?.icon && !missing}<span class="emoji"><PageIcon icon={page.icon} /></span>
      {:else}<Icon name={kind === 'page' ? 'page' : kind === 'event' ? 'calendar' : kind === 'assignment' ? 'assignment' : 'file'} size={block ? 18 : 15} />{/if}
    </span>
  {/if}
  <span class="chip-title" class:done={assignment?.status === 'done'}>{title}</span>
  {#if assignment && !missing && assignment.dueDate}
    <span class="chip-meta {urgency}">{formatDue(assignment.dueDate, assignment.dueTime, clock.today)}</span>
  {:else if event && !missing}
    <span class="chip-meta">{formatDate(date ?? event.startDate)}{event.startTime ? `, ${formatTime(event.startTime)}` : ''}</span>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.28em;
    padding: 0 0.15em;
    margin: 0 -0.05em;
    border-radius: 4px;
    color: var(--text);
    white-space: nowrap;
    cursor: default;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .chip:hover {
    background: var(--fill);
  }
  .chip-icon {
    display: inline-flex;
    align-self: center;
    color: var(--text-2);
  }
  .chip-icon.check {
    margin-right: 0.08em;
  }
  .emoji {
    font-size: 0.95em;
    line-height: 1;
  }
  .chip-title {
    font-weight: var(--fw-550);
    white-space: normal;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--text-4);
    text-underline-offset: 0.22em;
    transition: text-decoration-color var(--dur-fast) var(--ease);
  }
  .chip:hover .chip-title {
    text-decoration-color: var(--text-2);
  }
  /* Planner items read as tags rather than links. */
  .assignment .chip-title,
  .event .chip-title,
  .file .chip-title {
    text-decoration: none;
  }
  .chip-title.done {
    color: var(--text-3);
    text-decoration: line-through;
  }
  .chip-meta {
    font-family: var(--font-ui);
    font-size: 0.8em;
    font-weight: var(--fw-500);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .chip-meta.overdue {
    color: var(--danger);
  }
  .chip-meta.today {
    color: var(--c-orange);
  }
  .assignment,
  .event,
  .file {
    padding: 0.08em 0.4em;
    line-height: 1.35;
    border-radius: 6px;
    background: var(--fill);
  }
  .assignment:hover,
  .event:hover,
  .file:hover {
    background: var(--fill-2);
  }

  /* Block form: a full-width row, like a sub-page in a list. */
  .chip.block {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--h-md);
    padding: 4px 8px;
    margin: 0 -8px;
    border-radius: var(--r-sm);
    background: none;
  }
  .chip.block:hover {
    background: var(--fill);
  }
  .chip.block .chip-icon {
    width: 24px;
    justify-content: center;
  }
  .chip.block .emoji {
    font-size: 18px;
  }
  .chip.block .chip-title {
    font-weight: var(--fw-500);
  }

  .missing {
    color: var(--text-3);
    background: none;
  }
  .missing .chip-icon {
    color: var(--text-4);
  }
  .missing .chip-title {
    font-weight: var(--fw-400);
    text-decoration-line: line-through;
  }
  .missing:hover {
    background: none;
  }
</style>
