<script lang="ts">
  /** A view's sorts: by one property, then another to break ties. */
  import Icon from '../components/Icon.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { databases } from '../databases.svelte';
  import { typeInfo } from './schema';
  import type { DbView, SortRule } from '../types';

  let { dbId, view }: { dbId: string; view: DbView } = $props();

  const rules = $derived(view.config.sorts ?? []);
  const allProps = $derived(databases.props(dbId).filter((p) => p.type !== 'button'));
  const unused = $derived(allProps.filter((p) => !rules.some((r) => r.prop === p.id)));

  function save(next: SortRule[]) {
    databases.updateView(dbId, view.id, { sorts: next });
  }

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }
</script>

<div class="sorts">
  {#each rules as rule, i (rule.prop)}
    <div class="rule">
      <span class="lead">{i === 0 ? 'Sort by' : 'then'}</span>
      <select
        class="pop-input"
        value={rule.prop}
        onchange={(e) => save(rules.map((r, j) => (j === i ? { ...r, prop: (e.currentTarget as HTMLSelectElement).value } : r)))}
        aria-label="Property"
      >
        {#if !databases.prop(dbId, rule.prop)}<option value={rule.prop} disabled>Deleted property</option>{/if}
        {#each allProps.filter((p) => p.id === rule.prop || !rules.some((r) => r.prop === p.id)) as p (p.id)}
          <option value={p.id}>{p.name || typeInfo(p.type).label}</option>
        {/each}
      </select>
      <Segmented
        label="Direction"
        value={rule.dir}
        options={[
          { value: 'asc', label: 'Up', icon: 'arrow-up' },
          { value: 'desc', label: 'Down', icon: 'arrow-down' },
        ]}
        iconOnly
        onchange={(d) => save(rules.map((r, j) => (j === i ? { ...r, dir: d as 'asc' | 'desc' } : r)))}
      />
      {#if rules.length > 1}
        <button class="icon-btn small" onclick={() => move(i, i === 0 ? 1 : -1)} aria-label="Change priority" data-tip={i === 0 ? 'Sort by this second' : 'Sort by this first'}>
          <Icon name="arrow-up-down" size={13} />
        </button>
      {/if}
      <button class="icon-btn small" onclick={() => save(rules.filter((_, j) => j !== i))} aria-label="Remove sort" data-tip="Remove"><Icon name="x" size={13} /></button>
    </div>
  {:else}
    <p class="empty">Rows are in your own order: drag them to rearrange. Add a sort to order them by a property instead.</p>
  {/each}
  {#if unused.length}
    <button class="pop-item add" onclick={() => save([...rules, { prop: unused[0].id, dir: 'asc' }])}><Icon name="plus" size={14} /><span class="grow">Add a sort</span></button>
  {/if}
  {#if rules.length}
    <button class="pop-item add" onclick={() => save([])}><Icon name="x" size={14} /><span class="grow">Back to my own order</span></button>
  {/if}
</div>

<style>
  .sorts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lead {
    flex: none;
    width: 48px;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    text-align: right;
  }
  .rule select {
    flex: 1;
    min-width: 0;
    height: 26px;
    font-size: var(--fs-ui);
  }
  .icon-btn.small {
    width: 24px;
    height: 24px;
  }
  .empty {
    margin: 4px 6px 6px;
    font-size: var(--fs-ui);
    line-height: 1.45;
    color: var(--text-3);
  }
  .add {
    color: var(--text-2);
  }
</style>
