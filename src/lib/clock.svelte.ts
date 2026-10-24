/** The current date and minute, so "today" and "overdue" update live. */

import { nowTime, todayISO } from './dates';

export const clock = $state({ today: todayISO(), time: nowTime() });

setInterval(() => {
  const today = todayISO();
  const time = nowTime();
  if (today !== clock.today) clock.today = today;
  if (time !== clock.time) clock.time = time;
}, 15_000);
