import { t, type Lang } from '@/core/i18n';
import type { ViewBlock } from '@/core/session/view';
import { Textarea } from '@/ui/components/ui/textarea';
import { GradedItem } from './GradedItem';

/** Error spotting: each paragraph with one textarea (`wrong → right` per line), or, once graded, what was found. */
export function SpotBlock({ block, lang, values, onChange, graded }: {
  block: ViewBlock; lang: Lang; values: Record<string, string>; onChange: (key: string, value: string) => void; graded: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {block.paragraphs.map((p) => {
        const key = `${block.id}:${p.index}`;
        const labelId = `para-${key.replace(':', '-')}`;
        return (
          <div key={key}>
            <p id={labelId} className="reading">{p.text}</p>
            {graded ? (
              <>
                {p.learnerText?.trim() && (
                  <div className="mt-3">
                    <p className="label text-faint">{t(lang, 'spot.lines')}</p>
                    <p className="answer mt-1 whitespace-pre-line text-muted-foreground">
                      {p.learnerText.split(/\r?\n/).filter((l) => l.trim() !== '').join('\n')}
                    </p>
                  </div>
                )}
                <ul className="mt-4 flex flex-col gap-3">
                  {(p.errors ?? []).map((e) => <GradedItem key={e.id} item={e} lang={lang} />)}
                </ul>
                {(p.extra ?? []).map((x, i) => (
                  <p key={i} className="reading mt-3 rounded-sm bg-note/10 px-3 py-2 text-note">
                    {t(lang, 'spot.notError', { text: x.text, explanation: x.explanation })}
                  </p>
                ))}
              </>
            ) : (
              <Textarea
                aria-labelledby={labelId}
                className="mt-3"
                rows={3}
                placeholder={t(lang, 'input.spot')}
                value={values[key] ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
