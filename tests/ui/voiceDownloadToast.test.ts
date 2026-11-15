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

  test('the end of a download is a success', () => {
    expect(downloadToast('downloading', 'loading', 1, 100, null)).toEqual({ kind: 'success' });
    expect(downloadToast('downloading', 'ready', 1, 100, null)).toEqual({ kind: 'success' });
  });

  test('a failed download is a failure with its message', () => {
    expect(downloadToast('downloading', 'failed', 0.3, 30, 'HTTP 500')).toEqual({ kind: 'failure', message: 'HTTP 500' });
  });

  test('a failure without a message has an empty message', () => {
    expect(downloadToast('downloading', 'failed', 0.3, 30, null)).toEqual({ kind: 'failure', message: '' });
  });

  test('no download in the status change means no notification', () => {
    expect(downloadToast('idle', 'loading', 0, null, null)).toBeNull();
    expect(downloadToast('loading', 'ready', 1, null, null)).toBeNull();
    expect(downloadToast('ready', 'failed', 0, null, 'x')).toBeNull();
  });
});
