import { describe, expect, test } from 'vitest';
import type { GeneratedBlock, GeneratedItem, GeneratedParagraph, GeneratedSession } from '@/core/llm/types';
import { checkGenerated, normaliseTopicKey } from '@/core/validate/taskChecks';

const ctx = {
  topics: new Map([
    ['conditionals', { hasRule: true, sections: ['Type 1', 'Type 2'] }],
    ['present-perfect', { hasRule: true, sections: ['## Since and for'] }],
    ['articles', { hasRule: false, sections: ['Definite'] }],
  ]),
  dueTopicKeys: ['conditionals'],
};

const item = (over: Partial<GeneratedItem> = {}): GeneratedItem => ({
  prompt: 'If it rains, I ___ stay in.',
  expected: 'will',
  topicKey: 'conditionals',
  ruleSection: 'Type 1',
  isCheck: false,
  ...over,
});

const errorOf = (over: Partial<GeneratedParagraph['errors'][number]> = {}) => ({
  wrong: 'go',
  correction: 'went',
  topicKey: 'present-perfect',
  ruleSection: '## Since and for',
  ...over,
});

const spotText = 'Yesterday I go to the shop and buy two apple.';
const fiveErrors = () => [errorOf(), errorOf(), errorOf(), errorOf(), errorOf()];

const block = (over: Partial<GeneratedBlock> = {}): GeneratedBlock => ({
  kind: 'task',
  format: 'gap',
  title: 'Task',
  instruction: 'Fill the gaps.',
  formatExample: 'I ___ there. -> was',
  minutes: 5,
  items: [item(), item(), item()],
  paragraphs: [],
  question: '',
  ...over,
});

const valid = (): GeneratedSession => ({
  blocks: [
    block({
      kind: 'review',
      format: 'gap',
      items: [
        item({ isCheck: true }),
        item({ prompt: 'I ___ there.', expected: 'was', topicKey: 'present-perfect', ruleSection: '## Since and for' }),
        item({ prompt: 'She ___ here since 2020.', expected: 'has been', topicKey: 'present-perfect', ruleSection: 'Since and for' }),
      ],
    }),
    block({
      kind: 'task',
      format: 'fix',
      formatExample: 'He go home. -> goes',
      items: [
        item({ prompt: 'She have gone.', expected: 'has gone', topicKey: 'present-perfect', ruleSection: 'Since and for' }),
        item({ prompt: 'I have lived here.', expected: '✓', topicKey: 'present-perfect', ruleSection: 'Since and for' }),
        item({ prompt: 'He go home.', expected: 'goes', topicKey: 'present-perfect', ruleSection: 'Since and for' }),
      ],
    }),
    block({
      kind: 'task',
      format: 'spot',
      formatExample: 'go -> went',
      items: [],
      paragraphs: [{ text: spotText, errors: fiveErrors() }],
    }),
    block({
      kind: 'speaking',
      format: 'question',
      formatExample: '',
      items: [],
      paragraphs: [],
      question: 'Describe your last holiday.',
    }),
  ],
});

const withItemPrompt = (prompt: string) => {
  const s = valid();
  s.blocks[0]!.items[1]!.prompt = prompt;
  return s;
};

describe('normaliseTopicKey', () => {
  test('trims, lowercases and joins whitespace with hyphens', () => {
    expect(normaliseTopicKey(' Present Perfect ')).toBe('present-perfect');
    expect(normaliseTopicKey('a \t  b')).toBe('a-b');
  });
});

describe('checkGenerated', () => {
  test('a fully valid session returns no violations', () => {
    expect(checkGenerated(valid(), ctx)).toEqual([]);
  });

  test('topic keys and due keys are normalised before comparing', () => {
    const s = valid();
    s.blocks[0]!.items[0]!.topicKey = ' Conditionals ';
    const c = {
      topics: new Map([
        [' Conditionals ', { hasRule: true, sections: ['Type 1'] }],
        [' Present Perfect ', { hasRule: true, sections: ['Since and for'] }],
      ]),
      dueTopicKeys: ['CONDITIONALS'],
    };
    expect(checkGenerated(s, c)).toEqual([]);
  });

  test('section match ignores leading # and surrounding spaces, but is case-sensitive', () => {
    const s = valid();
    s.blocks[0]!.items[0]!.ruleSection = ' ## Type 1 ';
    expect(checkGenerated(s, ctx)).toEqual([]);
    s.blocks[0]!.items[0]!.ruleSection = 'type 1';
    expect(checkGenerated(s, ctx)).toEqual(['b0.i0 section: "type 1" not in "conditionals"']);
  });

  describe('TD-1 format and placeholders', () => {
    test('blank "I ___ there." passes', () => {
      expect(checkGenerated(withItemPrompt('I ___ there.'), ctx)).toEqual([]);
    });

    test('"well-known" passes', () => {
      expect(checkGenerated(withItemPrompt('The ___ is well-known.'), ctx)).toEqual([]);
    });

    test('a standalone dash placeholder fails', () => {
      expect(checkGenerated(withItemPrompt('I ___ - there.'), ctx)).toEqual([
        'b0.i1 TD-1: placeholder "-"',
      ]);
    });

    test('a double-underscore run fails', () => {
      expect(checkGenerated(withItemPrompt('I ___ __ there.'), ctx)).toEqual([
        'b0.i1 TD-1: placeholder "__"',
      ]);
    });

    test('a four-underscore run fails', () => {
      expect(checkGenerated(withItemPrompt('I ____ there.'), ctx)).toEqual([
        'b0.i1 TD-1: placeholder "____"',
      ]);
    });

    test('a gap prompt without ___ fails', () => {
      expect(checkGenerated(withItemPrompt('I was there.'), ctx)).toEqual([
        'b0.i1 TD-1: gap prompt has no ___',
      ]);
    });

    test('a placeholder in spot paragraph text fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.text = 'Yesterday I - go to the shop and buy two apple.';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0 TD-1: placeholder "-"']);
    });

    test('an empty format example fails for gap, fix and spot', () => {
      const s = valid();
      s.blocks[0]!.formatExample = '   ';
      s.blocks[1]!.formatExample = '';
      s.blocks[2]!.formatExample = '';
      expect(checkGenerated(s, ctx)).toEqual([
        'b0 TD-1: format example is empty',
        'b1 TD-1: format example is empty',
        'b2 TD-1: format example is empty',
      ]);
    });
  });

  describe('TD-4 fix blocks', () => {
    test('a fix block without a ✓ item fails', () => {
      const s = valid();
      s.blocks[1]!.items[1]!.expected = 'has lived';
      expect(checkGenerated(s, ctx)).toEqual(['b1 TD-4: no item with expected ✓']);
    });

    test('a fix block with only ✓ items fails', () => {
      const s = valid();
      s.blocks[1]!.items = s.blocks[1]!.items.map((i) => ({ ...i, expected: '✓' }));
      expect(checkGenerated(s, ctx)).toEqual(['b1 TD-4: no item with a correction']);
    });
  });

  describe('TD-7 correction word count', () => {
    test('a three-word fix correction fails', () => {
      const s = valid();
      s.blocks[1]!.items[0]!.expected = 'have been living';
      expect(checkGenerated(s, ctx)).toEqual(['b1.i0 TD-7: correction has 3 words']);
    });

    test('a one-word and a two-word fix correction pass', () => {
      expect(checkGenerated(valid(), ctx)).toEqual([]);
    });

    test('a three-word spot correction fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors[2]!.correction = 'had been going';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0.e2 TD-7: correction has 3 words']);
    });

    test('an empty spot correction fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors[0]!.correction = '  ';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0.e0 TD-7: correction has 0 words']);
    });
  });

  describe('TD-8 spot paragraphs', () => {
    test('four errors fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors = fiveErrors().slice(0, 4);
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0 TD-8: has 4 errors, need 5–7']);
    });

    test('eight errors fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors = [...fiveErrors(), errorOf(), errorOf(), errorOf()];
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0 TD-8: has 8 errors, need 5–7']);
    });

    test('seven errors passes', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors = [...fiveErrors(), errorOf(), errorOf()];
      expect(checkGenerated(s, ctx)).toEqual([]);
    });

    test('a newline in the text fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.text = 'Yesterday I go\nto the shop.';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0 TD-8: text has a line break']);
    });

    test('a carriage return in the text fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.text = 'Yesterday I go\rto the shop.';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0 TD-8: text has a line break']);
    });
  });

  describe('topics and rule sections', () => {
    test('an unknown item topic key fails', () => {
      const s = valid();
      s.blocks[0]!.items[1]!.topicKey = 'nope';
      expect(checkGenerated(s, ctx)).toEqual(['b0.i1 topic: unknown topic "nope"']);
    });

    test('a topic without a rule fails', () => {
      const s = valid();
      s.blocks[0]!.items[1]!.topicKey = 'articles';
      expect(checkGenerated(s, ctx)).toEqual(['b0.i1 topic: no rule for "articles"']);
    });

    test('an unknown rule section fails', () => {
      const s = valid();
      s.blocks[0]!.items[1]!.ruleSection = 'Type 9';
      expect(checkGenerated(s, ctx)).toEqual(['b0.i1 section: "Type 9" not in "present-perfect"']);
    });

    test('an unknown error topic key fails', () => {
      const s = valid();
      s.blocks[2]!.paragraphs[0]!.errors[3]!.topicKey = 'nope';
      expect(checkGenerated(s, ctx)).toEqual(['b2.p0.e3 topic: unknown topic "nope"']);
    });
  });

  describe('due topics', () => {
    test('a due topic with no check item in a review block fails', () => {
      const s = valid();
      s.blocks[0]!.items[0]!.isCheck = false;
      expect(checkGenerated(s, ctx)).toEqual(['due: "conditionals" has no check item in a review block']);
    });

    test('a check item outside a review block does not count', () => {
      const s = valid();
      s.blocks[0]!.items[0]!.isCheck = false;
      s.blocks[1]!.items[0]!.topicKey = 'conditionals';
      s.blocks[1]!.items[0]!.ruleSection = 'Type 1';
      s.blocks[1]!.items[0]!.isCheck = true;
      expect(checkGenerated(s, ctx)).toEqual(['due: "conditionals" has no check item in a review block']);
    });
  });

  describe('minimum items', () => {
    test('a gap block with 2 items fails', () => {
      const s = valid();
      s.blocks[0]!.items = s.blocks[0]!.items.slice(0, 2);
      expect(checkGenerated(s, ctx)).toEqual(['b0 items: 2 items, need at least 3']);
    });

    test('a fix block with 2 items fails', () => {
      const s = valid();
      s.blocks[1]!.items = s.blocks[1]!.items.slice(0, 2);
      expect(checkGenerated(s, ctx)).toEqual(['b1 items: 2 items, need at least 3']);
    });
  });
});
