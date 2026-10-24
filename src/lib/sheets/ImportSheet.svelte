<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import StatusCheck from '../ui/StatusCheck.svelte';
  import { colorVar } from '../colors';
  import { formatDate, formatTime, REPEAT_LABELS } from '../dates';
  import { previous, runImport, type ImportRow } from '../ics-import.svelte';
  import { planner } from '../planner.svelte';
  import { ui } from '../ui.svelte';
  import type { IcsItem } from '../ics';

  let { name, items }: { name: string; items: IcsItem[] } = $props();

  // svelte-ignore state_referenced_locally (seeded once when opened)
  let rows = $state<ImportRow[]>(items.map((i) => ({ ...i, include: true })));
  let busy = $state(false);

  const chosen = $derived(rows.filter((r) => r.include));
  const updates = $derived(chosen.filter((r) => previous(r)).length);
  const simplified = $derived(chosen.filter((r) => r.simplified).length);
  const allOn = $derived(chosen.length === rows.length);

  const kinds = [
    { value: 'event' as const, label: 'Event', icon: 'calendar' },
    { value: 'assignment' as const, label: 'Assignment', icon: 'assignment' },
  ];

  const close = () => (ui.importSheet = null);

  function courseColor(course: string | null): string {
    if (!course) return 'var(--accent)';
    const c = planner.courses.find((x) => x.name.trim().toLowerCase() === course.trim().toLowerCase());
    return c ? colorVar(c.color) : 'var(--c-gray)';
  }

  function when(r: ImportRow): string {
    const parts = [formatDate(r.startDate, { weekday: 'short', month: 'short', day: 'numeric' })];
    if (r.startTime) parts.push(formatTime(r.startTime));
    if (r.repeat !== 'none') parts.push(REPEAT_LABELS[r.repeat]);
    return parts.join(' · ');
  }

  async function run() {
    busy = true;
    const { added, updated } = await runImport(rows);
    close();
    const n = (k: number, word: string) => `${k} ${word}`;
    ui.toast(
      [added && n(added, 'added'), updated && n(updated, 'updated')].filter(Boolean).join(', ') || 'Nothing imported',
    );
  }
</script>

<Modal onclose={close} width={640} label="Import Calendar">
  <header class="modal-head">
    <h2>Import Calendar</h2>
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="modal-body">
    <h3 class="group-title">
      <span class="file">{name}</span>
      <button class="btn small" onclick={() => rows.forEach((r) => (r.include = !allOn))}>{allOn ? 'Select None' : 'Select All'}</button>
    </h3>
    <div class="group list">
      {#each rows as r (r.uid)}
        {@const old = previous(r)}
        <div class="group-row compact" class:off={!r.include}>
          <StatusCheck done={r.include} size={18} label="Include {r.title}" ontoggle={() => (r.include = !r.include)} />
          <div class="row-label grow">
            <span class="name">{r.title}</span>
            <small>
              {when(r)}{#if r.course}<span class="course"><span class="dot" style:--dot={courseColor(r.course)}></span>{r.course}</span>{/if}
            </small>
          </div>
          {#if r.simplified}<span class="chip" data-tip="This repeat is more than Grad Notes can show; only the first one comes in">First Only</span>{/if}
          {#if old}<span class="chip" data-tip="Imported before; it will be updated">Update</span>{/if}
          <Segmented options={kinds} value={r.kind} onchange={(v) => (r.kind = v)} label="Import as" iconOnly />
        </div>
      {/each}
    </div>
  </div>

  <footer class="modal-foot">
    <span>
      {chosen.length} of {rows.length} selected{#if updates}, {updates} already imported{/if}{#if simplified}, {simplified} simplified{/if}
    </span>
    <div class="actions">
      <button class="btn small" onclick={close}>Cancel</button>
      <button class="btn small primary" onclick={run} disabled={busy || chosen.length === 0}>
        Import{chosen.length ? ` ${chosen.length}` : ''}
      </button>
    </div>
  </footer>
</Modal>

<style>
  .list {
    max-height: min(56vh, 520px);
    overflow-y: auto;
  }
  .file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .grow {
    flex: 1;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .course {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group-row {
    justify-content: flex-start;
    gap: 12px;
  }
  .off .row-label {
    opacity: 0.5;
  }
</style>
