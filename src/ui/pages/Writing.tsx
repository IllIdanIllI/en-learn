import { Fragment, useState } from 'react';
import { t } from '@/core/i18n';
import { loadWritingTexts, type WritingTextRow } from '@/core/progress/writing';
import { loadSessionView, type ViewBlock } from '@/core/session/view';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { GradedItem } from '@/ui/today/GradedItem';
import { Notice } from '@/ui/today/chips';
import { WritingResult } from '@/ui/today/WritingBlock';

/** Checked texts, newest first. A row opens in place to the text with its errors; read-only, disputes stay on Today. */
export function Writing() {
  const { deps, lang } = useCore();
  const loaded = useLoaded(() => loadWritingTexts(deps.db));
  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ViewBlock>>({});
  const [detailError, setDetailError] = useState<string | null>(null);

  const toggle = async (row: WritingTextRow) => {
    if (open === row.blockId) {
      setOpen(null);
      return;
    }
    setOpen(row.blockId);
    if (details[row.blockId]) return;
    try {
      const view = await loadSessionView(deps.db, row.sessionId);
      const block = view.blocks.find((b) => b.id === row.blockId);
      if (block) setDetails((prev) => ({ ...prev, [row.blockId]: block }));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <h1 className="headline">{t(lang, 'nav.writing')}</h1>
      {loaded && 'error' in loaded && <Notice className="mt-6">{t(lang, 'writing.loadError', { message: loaded.error })}</Notice>}
      {detailError !== null && <Notice className="mt-6">{t(lang, 'writing.loadError', { message: detailError })}</Notice>}
      {loaded && 'data' in loaded && (() => {
        const rows = loaded.data;
        if (rows.length === 0) return <p className="reading mt-6 text-muted-foreground">{t(lang, 'writing.page.empty')}</p>;
        return (
          <Table className="mt-6">
            <TableHeader>
              <TableRow>
                <TableHead>{t(lang, 'writing.col.date')}</TableHead>
                <TableHead>{t(lang, 'writing.col.prompt')}</TableHead>
                <TableHead>{t(lang, 'writing.col.kind')}</TableHead>
                <TableHead>{t(lang, 'writing.col.words')}</TableHead>
                <TableHead>{t(lang, 'writing.col.rate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = open === r.blockId;
                const block = details[r.blockId];
                const wrong = block?.items.filter((i) => i.effective === 'wrong') ?? [];
                return (
                  <Fragment key={r.blockId}>
                    <TableRow>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="max-w-0">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => void toggle(r)}
                          className="block w-full cursor-pointer truncate text-left transition-colors duration-150 hover:text-primary"
                        >
                          {r.prompt}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t(lang, `writing.kind.${r.format}`)}</TableCell>
                      <TableCell className="tabular">{r.words}</TableCell>
                      <TableCell className="tabular">{r.rate === null ? '' : r.rate.toFixed(1)}</TableCell>
                    </TableRow>
                    {isOpen && block && (
                      <TableRow>
                        <TableCell colSpan={5} data-testid="writing-detail" className="whitespace-normal">
                          <WritingResult text={r.text} fragments={wrong.map((i) => i.answer?.text ?? '')} words={r.words} lang={lang} />
                          {block.items.length > 0 && (
                            <ol className="mt-6 flex flex-col gap-3">
                              {block.items.map((item, i) => <GradedItem key={item.id} item={item} number={i + 1} lang={lang} readOnly />)}
                            </ol>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        );
      })()}
    </>
  );
}
