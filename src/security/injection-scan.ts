/** Pure defense-in-depth scanner for text entering a model context. Not an authorization boundary. */
/**
 * Invisible / control characters that essentially never appear in legitimate
 * prose but are the classic carrier for smuggled hidden instructions:
 * zero-width chars, bidi overrides, and the Unicode "tag" block (U+E0000-E007F)
 * used to encode invisible ASCII payloads.
 */
const INVISIBLE_CHAR_RE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]|[\u{E0000}-\u{E007F}]/u

interface InjectionPattern {
  name: string
  re: RegExp
}

/**
 * Injection-directive patterns. Each targets an imperative phrase directed at
 * an assistant, not a topical mention. Kept deliberately narrow to avoid
 * flagging our legitimate AI-feature documentation.
 */
const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'fabricated-reasoning',
    re: /<\/?(?:think|thinking|reasoning|reflection|analysis)(?:\s[^>]*)?\s*>/i,
  },
  {
    name: 'data-boundary-escape',
    re: /<\/(?:untrusted(?:[_-]data)?|tool[_-](?:result|output)|document|context)\s*>/i,
  },
  {
    name: 'tool-directive',
    // Match actionable tool/shell directives, not prose about game controls.
    re: /\b(?:call|invoke|execute|run|use)\s+(?:(?:the|a)\s+)?(?:[a-z][a-z0-9]*_[a-z0-9_]+\b|(?:shell|terminal|bash)\s+command\b|(?:tool|function)\s+(?:named\s+)?(?:[\x60"'][a-z][a-z0-9_.-]*[\x60"']|[a-z][a-z0-9]*_[a-z0-9_]+\b|[a-z][a-z0-9_.-]*\s*\())/i,
  },
  {
    name: 'override-instructions',
    re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(all\s+)?(your\s+|the\s+|any\s+|previous\s+|prior\s+|above\s+|earlier\s+|preceding\s+)+(instructions?|prompts?|rules?|guidelines?|context|directions?)\b/i,
  },
  {
    name: 'role-reassignment',
    // "act as ..." is deliberately EXCLUDED: legit legal/data prose says "we act
    // as your processor". These forms have no innocent reading in our docs.
    re: /\b(you\s+are\s+now|you\s+are\s+no\s+longer|from\s+now\s+on[, ]+you\s+(?:are|will|must)|pretend\s+(?:to\s+be|you\s+are)|roleplay\s+as|impersonate\s+(?:a|an|the)|act\s+as\s+(?:dan|an?\s+(?:unrestricted|jailbroken|uncensored|evil)))\b/i,
  },
  {
    name: 'reveal-system-prompt',
    // Requires an injection-SPECIFIC object ("system prompt", "prompt above",
    // "your instructions", "original instructions"), NOT a bare "prompt"; our
    // SDK docs legitimately say "show the prompt" (a feedback form).
    re: /\b(reveal|show|print|repeat|output|display|disclose|reproduce|leak|dump)\b[^.\n]{0,24}\b(?:your\s+(?:system\s+)?(?:prompt|instructions?|directives?)|the\s+(?:system\s+prompt|prompt\s+above|(?:instructions?|text|content)\s+above)|(?:the|your)\s+(?:original|initial|previous|preceding)\s+(?:instructions?|prompt))\b/i,
  },
  {
    name: 'ask-original-instructions',
    re: /\bwhat\s+(are|were)\s+your\s+(original\s+|initial\s+|previous\s+)?(instructions?|(system\s+)?prompt|directives?|rules?)\b/i,
  },
  {
    name: 'chat-template-token',
    // Model chat-template control tokens a legitimate prose doc never contains
    // (ChatML pipe tokens, Llama INST/SYS, Alpaca instruction headers). A doc
    // illustrating an Ask conversation shows plain "Assistant: ..." prose, which
    // these do NOT match; only the special-token forms trip.
    re: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|<<\/?sys>>|\[\/?inst\]|(^|\n)\s*#{2,}\s*(instruction|system\s+prompt)\s*:/i,
  },
]

export interface InjectionVerdict {
  /** True when the text carries a prompt-injection tell and should be withheld at a model boundary. */
  flagged: boolean
  /** Named tells that matched (for loud, actionable logging). */
  tells: string[]
}

/**
 * Scan a single chunk of text for prompt-injection content. Pure + synchronous.
 * Returns every tell that matched so the caller can log precisely which pattern
 * tripped (and on which source).
 */
export function scanForInjection(text: string): InjectionVerdict {
  const tells: string[] = []

  if (INVISIBLE_CHAR_RE.test(text)) tells.push('invisible-chars')

  for (const { name, re } of INJECTION_PATTERNS) {
    if (re.test(text)) tells.push(name)
  }

  return { flagged: tells.length > 0, tells }
}
