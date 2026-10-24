/** Ready-made databases: properties and views to start from. */

import { keysBetween } from './order';
import { STATUS_OPTIONS } from './schema';
import type { DbView, Property, PropertyConfig, PropertyType, SelectOption, ViewConfig, ViewType } from '../types';
import { lineIcon } from '../page-icon';

export interface Template {
  key: string;
  name: string;
  icon: string;
  description: string;
  properties: Property[];
  views: DbView[];
}

type P = [id: string, name: string, type: PropertyType, config?: PropertyConfig];
type V = [id: string, name: string, type: ViewType, config?: ViewConfig];

const opts = (...list: [string, string, string?][]): SelectOption[] =>
  list.map(([id, name, color]) => ({ id, name, color: color ?? 'gray' }));

function make(key: string, name: string, icon: string, description: string, title: string, props: P[], views: V[]): Template {
  const pk = keysBetween(null, null, props.length + 1);
  const vk = keysBetween(null, null, views.length);
  return {
    key,
    name,
    icon,
    description,
    properties: [
      { id: 'title', name: title, type: 'title', config: {}, sortKey: pk[0] },
      ...props.map(([id, n, type, config], i) => ({ id, name: n, type, config: config ?? {}, sortKey: pk[i + 1] })),
    ],
    views: views.map(([id, n, type, config], i) => ({ id, name: n, type, config: config ?? {}, sortKey: vk[i] })),
  };
}

const priority = opts(['low', 'Low', 'gray'], ['medium', 'Medium', 'yellow'], ['high', 'High', 'red']);

export const TEMPLATES: Template[] = [
  make('blank', 'Empty database', lineIcon('database'), 'A table to shape however you like', 'Name', [['notes', 'Notes', 'text']], [['table', 'Table', 'table']]),
  make(
    'tasks',
    'Tasks',
    lineIcon('list-checks', 'blue'),
    'To-dos on a board, with due dates on your calendar',
    'Task',
    [
      ['status', 'Status', 'status', { options: STATUS_OPTIONS.map((o) => ({ ...o })) }],
      ['due', 'Due', 'date', { onCalendar: true }],
      ['priority', 'Priority', 'select', { options: priority }],
      ['course', 'Course', 'course'],
    ],
    [
      ['board', 'Board', 'board', { group: 'status' }],
      ['table', 'All tasks', 'table', { sorts: [{ prop: 'due', dir: 'asc' }] }],
      ['calendar', 'Calendar', 'calendar', { dateProp: 'due' }],
    ],
  ),
  make(
    'projects',
    'Projects',
    lineIcon('rocket', 'purple'),
    'Bigger pieces of work, how far along they are, and when they’re due',
    'Project',
    [
      ['status', 'Status', 'status', { options: STATUS_OPTIONS.map((o) => ({ ...o })) }],
      ['dates', 'Dates', 'date', { onCalendar: true }],
      ['progress', 'Progress', 'number', { format: 'percent', display: 'bar', max: 100 }],
      ['priority', 'Priority', 'select', { options: priority }],
      ['tags', 'Tags', 'tags'],
    ],
    [
      ['table', 'All projects', 'table'],
      ['board', 'By status', 'board', { group: 'status' }],
      ['calendar', 'Timeline', 'calendar', { dateProp: 'dates' }],
    ],
  ),
  make(
    'reading',
    'Reading list',
    lineIcon('book-open', 'orange'),
    'Books and articles: what you’re reading, what you thought',
    'Title',
    [
      ['author', 'Author', 'text'],
      ['status', 'Status', 'select', { options: opts(['want', 'Want to read', 'gray'], ['reading', 'Reading', 'blue'], ['finished', 'Finished', 'green']) }],
      ['rating', 'Rating', 'select', { options: opts(['r1', '★', 'yellow'], ['r2', '★★', 'yellow'], ['r3', '★★★', 'yellow'], ['r4', '★★★★', 'yellow'], ['r5', '★★★★★', 'yellow']) }],
      ['genre', 'Genre', 'multiSelect', { options: opts(['fiction', 'Fiction', 'purple'], ['science', 'Science', 'teal'], ['history', 'History', 'orange'], ['course', 'For class', 'blue']) }],
      ['pages', 'Pages', 'number'],
      ['finished', 'Finished', 'date'],
    ],
    [
      ['gallery', 'Shelf', 'gallery', { cover: 'page', shown: ['author', 'rating'] }],
      ['board', 'By status', 'board', { group: 'status', shown: ['author', 'rating'] }],
      ['table', 'Table', 'table'],
    ],
  ),
  make(
    'habits',
    'Habit tracker',
    lineIcon('sprout', 'green'),
    'One row a day: tick what you did and watch the streak',
    'Day',
    [
      ['date', 'Date', 'date'],
      ['exercise', 'Exercise', 'checkbox'],
      ['read', 'Read 20 min', 'checkbox'],
      ['sleep', 'Slept 8h', 'checkbox'],
      ['water', 'Water', 'checkbox'],
      ['score', 'Score', 'formula', { expression: 'round(({Exercise} + {Read 20 min} + {Slept 8h} + {Water}) / 4 * 100)', format: 'percent', display: 'bar', max: 100 }],
    ],
    [
      ['table', 'This month', 'table', { sorts: [{ prop: 'date', dir: 'desc' }], filters: [{ id: 'f1', prop: 'date', op: 'thisMonth' }], calc: { exercise: 'percentChecked', read: 'percentChecked', sleep: 'percentChecked', water: 'percentChecked', score: 'average' } }],
      ['calendar', 'Calendar', 'calendar', { dateProp: 'date' }],
      ['all', 'All days', 'table', { sorts: [{ prop: 'date', dir: 'desc' }] }],
    ],
  ),
  make(
    'study',
    'Study log',
    lineIcon('clock', 'yellow'),
    'Time spent per course, adding up as you go',
    'Topic',
    [
      ['course', 'Course', 'course'],
      ['date', 'Date', 'date'],
      ['minutes', 'Minutes', 'number'],
      ['focus', 'Focus', 'select', { options: opts(['low', 'Distracted', 'gray'], ['ok', 'Okay', 'yellow'], ['deep', 'Deep focus', 'green']) }],
    ],
    [
      ['table', 'Log', 'table', { sorts: [{ prop: 'date', dir: 'desc' }], calc: { minutes: 'sum' } }],
      ['chart', 'Minutes per course', 'chart', { chart: { kind: 'bar', x: 'course', agg: 'sum', y: 'minutes' } }],
      ['calendar', 'Calendar', 'calendar', { dateProp: 'date' }],
    ],
  ),
  make(
    'expenses',
    'Budget',
    lineIcon('wallet', 'teal'),
    'Spending by category, with totals',
    'Expense',
    [
      ['amount', 'Amount', 'number', { format: 'dollar' }],
      ['category', 'Category', 'select', { options: opts(['food', 'Food', 'orange'], ['rent', 'Rent', 'blue'], ['transport', 'Transport', 'teal'], ['books', 'Books & supplies', 'purple'], ['fun', 'Fun', 'pink'], ['other', 'Other', 'gray']) }],
      ['date', 'Date', 'date'],
      ['paid', 'Paid', 'checkbox'],
    ],
    [
      ['table', 'All spending', 'table', { sorts: [{ prop: 'date', dir: 'desc' }], calc: { amount: 'sum', paid: 'percentChecked' } }],
      ['chart', 'By category', 'chart', { chart: { kind: 'donut', x: 'category', agg: 'sum', y: 'amount' } }],
      ['month', 'This month', 'table', { filters: [{ id: 'f1', prop: 'date', op: 'thisMonth' }], calc: { amount: 'sum' } }],
    ],
  ),
  make(
    'applications',
    'Applications',
    lineIcon('briefcase', 'indigo'),
    'Jobs, internships or programs: where each one stands',
    'Role',
    [
      ['company', 'Company', 'text'],
      ['stage', 'Stage', 'select', { options: opts(['wish', 'Wishlist', 'gray'], ['applied', 'Applied', 'blue'], ['interview', 'Interview', 'purple'], ['offer', 'Offer', 'green'], ['no', 'Not this time', 'red']) }],
      ['applied', 'Applied on', 'date'],
      ['deadline', 'Deadline', 'date', { onCalendar: true }],
      ['link', 'Link', 'url'],
      ['contact', 'Contact', 'email'],
    ],
    [
      ['board', 'Pipeline', 'board', { group: 'stage', shown: ['company', 'deadline'] }],
      ['table', 'Table', 'table', { sorts: [{ prop: 'deadline', dir: 'asc' }] }],
    ],
  ),
  make(
    'contacts',
    'People',
    lineIcon('users', 'pink'),
    'Classmates, teachers and contacts in one place',
    'Name',
    [
      ['email', 'Email', 'email'],
      ['phone', 'Phone', 'phone'],
      ['course', 'Course', 'course'],
      ['birthday', 'Birthday', 'date'],
      ['tags', 'Tags', 'tags'],
    ],
    [
      ['table', 'Everyone', 'table'],
      ['gallery', 'Cards', 'gallery', { shown: ['email', 'course'] }],
    ],
  ),
  make(
    'recipes',
    'Recipes',
    lineIcon('utensils', 'red'),
    'A gallery of dishes, with the recipe in each page',
    'Dish',
    [
      ['meal', 'Meal', 'multiSelect', { options: opts(['breakfast', 'Breakfast', 'yellow'], ['lunch', 'Lunch', 'green'], ['dinner', 'Dinner', 'orange'], ['snack', 'Snack', 'pink']) }],
      ['minutes', 'Minutes', 'number'],
      ['tried', 'Tried it', 'checkbox'],
      ['source', 'Source', 'url'],
    ],
    [
      ['gallery', 'Gallery', 'gallery', { cover: 'page', cardSize: 'medium', shown: ['meal', 'minutes'] }],
      ['table', 'Table', 'table'],
    ],
  ),
];
