<script lang="ts">
  /**
   * A database's automations: rules like "when Status becomes Done, set
   * Finished to today". Each reads as a sentence; click one to change it.
   */
  import Icon from '../components/Icon.svelte';
  import Switch from '../ui/Switch.svelte';
  import ActionsEditor, { describeAction } from './ActionsEditor.svelte';
  import { databases, ACTION_TYPES } from '../databases.svelte';
  import { option, options, typeInfo } from './schema';
  import type { Automation } from '../types';

  let { dbId }: { dbId: string } = $props();

  const rules = $derived(databases.automations(dbId));
  let open = $state<string | null>(null);
  /** Properties whose changes can start a rule. */
  const watchable = $derived(databases.props(dbId).filter((p) => ACTION_TYPES.has(p.type) || p.type === 'relation' || p.type === 'files'));

  function when(a: Automation): string {
    if (a.type === 'added') return 'When a row is added';
    const p = databases.prop(dbId, a.config.prop);
    if (!p) return 'When a property changes';
    const to = a.config.to;
    if (to === undefined || to === null) return `When ${p.name} changes`;
    if (p.type === 'checkbox') return `When ${p.name} is ${to ? 'checked' : 'unchecked'}`;
    return `When ${p.name} becomes ${option(p, to)?.name ?? '?'}`;
  }

  function sentence(a: Automation): string {
    const acts = a.config.actions ?? [];
    return `${when(a)}, ${acts.length ? acts.map((x) => describeAction(dbId, x)).join(', then ') : 'do nothing yet'}`;
  }

  /**
   * A new rule starts as the most likely one: when the status (or a
   * checkbox) reaches "done", set the first date to today.
   */
  function add() {
    const props = databases.props(dbId);
    const watch =
      props.find((p) => p.type === 'status') ??
      props.find((p) => p.type === 'select' && /status|stage|state/i.test(p.name)) ??
      props.find((p) => p.type === 'checkbox') ??
      props.find((p) => p.type === 'select');
    const a = databases.addAutomation(dbId, watch ? 'changed' : 'added');
    if (!a) return;
    const date = props.find((p) => p.type === 'date');
    const actions = date ? [{ type: 'set' as const, prop: date.id, value: { mode: 'today' as const } }] : [];
    let to: string | boolean | null = null;
    if (watch?.type === 'checkbox') to = true;
    else if (watch?.type === 'status') to = options(watch).find((o) => o.group === 'done')?.id ?? null;
    else if (watch) to = options(watch).at(-1)?.id ?? null;
    databases.updateAutomation(dbId, a.id, { config: { ...a.config, prop: watch?.id, to, actions } });
    open = a.id;
  }

  function setTrigger(a: Automation, key: string) {
    if (key === 'added') databases.updateAutomation(dbId, a.id, { type: 'added', config: { ...a.config, prop: undefined, to: undefined } });
    else databases.updateAutomation(dbId, a.id, { type: 'changed', config: { ...a.config, prop: key, to: undefined } });
  }

  /** "to" choices for a property: any change, or a particular value. */
  function toChoices(propId: string | undefined): { key: string; label: string }[] {
    const p = databases.prop(dbId, propId);
    if (!p) return [];
    if (p.type === 'checkbox')
      return [
        { key: 'any', label: 'Changes in any way' },
        { key: 'true', label: 'Is checked' },
        { key: 'false', label: 'Is unchecked' },
      ];
    if (p.type === 'select' || p.type === 'status' || p.type === 'multiSelect') return [{ key: 'any', label: 'Changes in any way' }, ...options(p).map((o) => ({ key: `o:${o.id}`, label: `Becomes ${o.name}` }))];
    return [];
  }

  const toKey = (a: Automation) => (a.config.to === undefined || a.config.to === null ? 'any' : typeof a.config.to === 'boolean' ? String(a.config.to) : `o:${a.config.to}`);
  const fromToKey = (k: string): string | boolean | null => (k === 'any' ? null : k === 'true' ? true : k === 'false' ? false : k.slice(2));
</script>

<div class="ap">
  <div class="head">
    <Icon name="bolt" size={15} />
    <div>
      <h3>Automations</h3>
      <p>Rules that run when you add or change a row, so routine updates happen on their own.</p>
    </div>
  </div>

  {#each rules as a (a.id)}
    <div class="rule" class:off={a.config.off} class:open={open === a.id}>
      <div class="rule-top">
        <button class="summary" onclick={() => (open = open === a.id ? null : a.id)} aria-expanded={open === a.id}>
          <Icon name="chevron-right" size={12} stroke={2.2} />
          <span>{sentence(a)}</span>
        </button>
        <Switch on={!a.config.off} label="Turn on" onchange={() => databases.updateAutomation(dbId, a.id, { config: { ...a.config, off: !a.config.off } })} />
      </div>
      {#if open === a.id}
        <div class="editor">
          <div class="pop-head">When</div>
          <select class="pop-input small" value={a.type === 'added' ? 'added' : (a.config.prop ?? '')} onchange={(e) => setTrigger(a, (e.currentTarget as HTMLSelectElement).value)} aria-label="When">
            <option value="added">A row is added</option>
            <optgroup label="A property changes">
              {#each watchable as p (p.id)}<option value={p.id}>{p.name} ({typeInfo(p.type).label.toLowerCase()})</option>{/each}
            </optgroup>
          </select>
          {#if a.type === 'changed' && toChoices(a.config.prop).length}
            <select class="pop-input small" value={toKey(a)} onchange={(e) => databases.updateAutomation(dbId, a.id, { config: { ...a.config, to: fromToKey((e.currentTarget as HTMLSelectElement).value) } })} aria-label="Changes to">
              {#each toChoices(a.config.prop) as ch (ch.key)}<option value={ch.key}>{ch.label}</option>{/each}
            </select>
          {/if}
          <div class="pop-head">Then</div>
          <ActionsEditor {dbId} actions={a.config.actions ?? []} onchange={(actions) => databases.updateAutomation(dbId, a.id, { config: { ...a.config, actions } })} />
          <div class="pop-sep"></div>
          <button class="pop-item danger" onclick={() => void databases.deleteAutomation(dbId, a.id)}><Icon name="trash" size={14} /><span class="grow">Delete automation</span></button>
        </div>
      {/if}
    </div>
  {:else}
    <p class="empty">No automations yet. For example: when Status becomes Done, set a Finished date to today.</p>
  {/each}

  <button class="pop-item new" onclick={add}><Icon name="plus" size={14} /><span class="grow">New automation</span></button>
</div>

<style>
  .ap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    gap: 10px;
    padding: 6px 8px 4px;
  }
  .head :global(.icon) {
    margin-top: 2px;
    color: var(--text-2);
  }
  h3 {
    margin: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-650);
  }
  .head p {
    margin: 2px 0 0;
    font-size: var(--fs-footnote);
    line-height: 1.4;
    color: var(--text-3);
  }
  .rule {
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1px var(--separator);
  }
  .rule-top {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
  }
  .summary {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px;
    border-radius: var(--r-sm);
    font-size: var(--fs-ui);
    line-height: 1.4;
    color: var(--text);
    text-align: left;
  }
  .summary:hover {
    background: var(--fill);
  }
  .summary :global(.icon) {
    flex: none;
    margin-top: 3px;
    color: var(--text-3);
    transition: transform var(--dur-fast) var(--ease);
  }
  .rule.open .summary :global(.icon) {
    transform: rotate(90deg);
  }
  .rule.off .summary span {
    color: var(--text-3);
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 10px 8px;
  }
  .empty {
    margin: 4px 8px;
    font-size: var(--fs-footnote);
    line-height: 1.4;
    color: var(--text-3);
  }
  .new {
    color: var(--text-2);
  }
</style>
