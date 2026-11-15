import { describe, expect, test } from 'vitest';
import { downloadToast } from '@/ui/voice/downloadToast';

describe('downloadToast', () => {
  test('the first progress of a download shows at 0%', () => {
    expect(downloadToast('idle', 'downloading', 0.004, null, null)).toEqual({ kind: 'progress', percent: 0 });
  });

  test('the same whole percent as the last one shows nothing new', () => {
    expect(downloadToast('downloading', 'downloading', 0.305, 30, null)).toBeNull();
  });

  test('a new whole percent shows progress', () => {
    expect(downloadToast('downloading', 'downloading', 0.31, 30, null)).toEqual({ kind: 'progress', percent: 31 });
  });

  test('the start of loading shows the starting line, also when nothing was downloaded', () => {
    expect(downloadToast('idle', 'loading', 0, null, null)).toEqual({ kind: 'starting' });
    expect(downloadToast('downloading', 'loading', 1, 100, null)).toEqual({ kind: 'starting' });
    expect(downloadToast('failed', 'loading', 0, null, null)).toEqual({ kind: 'starting' });
  });

  test('staying in loading shows nothing new', () => {
    expect(downloadToast('loading', 'loading', 0, null, null)).toBeNull();
  });

  test('ready after downloading or loading is a success', () => {
    expect(downloadToast('loading', 'ready', 1, null, null)).toEqual({ kind: 'success' });
    expect(downloadToast('downloading', 'ready', 1, 100, null)).toEqual({ kind: 'success' });
  });

  test('ready without a start in between shows nothing', () => {
    expect(downloadToast('idle', 'ready', 1, null, null)).toBeNull();
    expect(downloadToast('ready', 'ready', 1, null, null)).toBeNull();
  });

  test('a failure with its message shows from any earlier status', () => {
    expect(downloadToast('downloading', 'failed', 0.3, 30, 'HTTP 500')).toEqual({ kind: 'failure', message: 'HTTP 500' });
    expect(downloadToast('loading', 'failed', 0, null, 'timeout')).toEqual({ kind: 'failure', message: 'timeout' });
    expect(downloadToast('ready', 'failed', 0, null, 'worker crashed')).toEqual({ kind: 'failure', message: 'worker crashed' });
  });

  test('a press while failed shows the failure again', () => {
    expect(downloadToast('failed', 'failed', 0, null, 'x')).toEqual({ kind: 'failure', message: 'x' });
  });

  test('failed with the error cleared by Retry shows nothing', () => {
    expect(downloadToast('failed', 'failed', 0, null, null)).toBeNull();
    expect(downloadToast('loading', 'failed', 0, null, null)).toBeNull();
  });
});
