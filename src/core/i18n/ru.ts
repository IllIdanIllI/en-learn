import type { en } from './en';

export const ru: Record<keyof typeof en, string> = {
  'title.week': 'Неделя {n}, {date} · {topic}',
  'title.review': 'Повторение, {date}',
  'spelling.title': 'Орфография',
  'spelling.instruction': 'Впишите слово по подсказке.',
  'nav.today': 'Сегодня',
  'nav.progress': 'Прогресс',
  'nav.rules': 'Правила',
  'nav.errors': 'Банк ошибок',
  'nav.settings': 'Настройки',
  'page.setup': 'Настройка программы',
  'page.prerequisites': 'Проверка Claude',
};
