/* Reminders: the typed-sentence reader.
   "remind me in six hours to get groceries" -> title "get groceries", due six hours from now, a cart icon.
   Everything is read from one sentence: the date and time, how it repeats, when the repeat ends, the "remind me again" gap,
   how urgent it is, a checklist, and an icon that fits. Numbers can be words (six, a couple of, half an hour, an hour and a half).
   Pure code (no page needed), so tests/nlp.test.js can run it with node. parse(text, now?) -> result:
     due ('YYYY-MM-DDTHH:MM' or null), repeat (free-text label or null), endText, snooze, urgency, checklist, icon,
     dateSet, timeSet, cleanTitle, matched, _exact                                                                          */
(function (root) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  function toLocalInput(d) {
    if (isNaN(d) || d.getFullYear() < 1000 || d.getFullYear() > 9999) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ---------------------------------------------------------------- words */
  const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const ORD_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21, 'twenty first': 21, 'twenty-second': 22, 'twenty second': 22, 'twenty-third': 23, 'twenty third': 23, 'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28, 'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31, 'thirty first': 31 };
  const ones = Object.keys(ONES).join('|'), tens = Object.keys(TENS).join('|');
  const NUMWORD = `(?:(?:${tens})(?:[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?|${ones})`;
  const wordNum = s => {
    s = s.toLowerCase().trim();
    const p = s.split(/[\s-]+/);
    return p.reduce((a, w) => a + (TENS[w] != null ? TENS[w] : ONES[w] != null ? ONES[w] : 0), 0);
  };
  const UNIT = '(?:minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)';
  const UNIT_ALL = `(?:${UNIT.slice(3, -1)}|[mhdw](?![a-z]))`;
  const DUR_ITEM = `\\d+(?:\\.\\d+)?\\s*${UNIT_ALL}`;
  const DUR_CHAIN = `${DUR_ITEM}(?:\\s*(?:,|and|&)?\\s*${DUR_ITEM})*`;
  const unitOf = tok => {
    const u = tok.toLowerCase();
    if (u.startsWith('mo')) return 'month';
    if (u[0] === 'm') return 'minute';
    if (u[0] === 'h') return 'hour';
    if (u[0] === 'd') return 'day';
    if (u[0] === 'w') return 'week';
    if (u[0] === 'y') return 'year';
    return null;
  };
  /* "2 hours 30 minutes" -> [{ n: 2, unit: 'hour' }, { n: 30, unit: 'minute' }] */
  function chainParts(s) {
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALL})`, 'gi'), out = [];
    let m; while ((m = re.exec(s))) out.push({ n: parseFloat(m[1]), unit: unitOf(m[2]) });
    return out;
  }
  const plural = (n, u) => `${n} ${u}${n === 1 ? '' : 's'}`;
  const chainLabel = parts => {
    const order = ['year', 'month', 'week', 'day', 'hour', 'minute'], acc = {};
    parts.forEach(p => { acc[p.unit] = (acc[p.unit] || 0) + p.n; });
    return order.filter(u => acc[u] != null).map(u => plural(acc[u], u)).join(' ');
  };
  function addParts(base, parts) {
    const d = new Date(base);
    parts.forEach(({ n, unit }) => {
      if (unit === 'minute') d.setTime(d.getTime() + n * 60000);
      else if (unit === 'hour') d.setTime(d.getTime() + n * 3600000);
      else if (unit === 'day') { const w = Math.trunc(n); d.setDate(d.getDate() + w); d.setTime(d.getTime() + (n - w) * 86400000); }
      else if (unit === 'week') { const w = Math.trunc(n * 7); d.setDate(d.getDate() + w); d.setTime(d.getTime() + (n * 7 - w) * 86400000); }
      else if (unit === 'month') { const w = Math.trunc(n); d.setMonth(d.getMonth() + w); d.setTime(d.getTime() + (n - w) * 30 * 86400000); }
      else if (unit === 'year') { const w = Math.trunc(n); d.setFullYear(d.getFullYear() + w); d.setTime(d.getTime() + (n - w) * 365 * 86400000); }
    });
    return d;
  }

  const DAY = '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
  const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = s => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(s.slice(0, 3).toLowerCase());
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  const MONTHNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10] || 'th');
  const dayList = s => {
    const found = []; const re = new RegExp(DAY, 'gi'); let m;
    while ((m = re.exec(s))) { const i = dayIndex(m[0]); if (i >= 0 && !found.includes(i)) found.push(i); }
    return found;
  };
  const listWords = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

  /* ---------------------------------------------------------------- number words and loose phrasing -> plain digits */
  function normalize(work) {
    let s = work;
    // "an hour and a half", "2 and a half hours", "half an hour", "a couple of hours", "a few minutes", "a day"
    s = s.replace(new RegExp(`\\b(${NUMWORD}|\\d+)\\s+and\\s+a\\s+half\\s+(${UNIT})\\b`, 'gi'), (m, n, u) => `${(/^\d+$/.test(n) ? +n : wordNum(n)) + 0.5} ${u}`);
    s = s.replace(new RegExp(`\\b(?:an?|1)\\s+(${UNIT})\\s+and\\s+a\\s+half\\b`, 'gi'), (m, u) => `1.5 ${u}`);
    s = s.replace(new RegExp(`\\b(every|each|in|for|after)\\s+(${UNIT})\\s+and\\s+a\\s+half\\b`, 'gi'), (m, w, u) => `${w} 1.5 ${u.replace(/s$/, '')}s`);
    s = s.replace(/\bhalf\s+(?:an?\s+)?(hour|hr)\b/gi, '30 minutes').replace(/\bhalf\s+(?:a\s+)?day\b/gi, '12 hours').replace(/\bhalf\s+(?:a\s+)?week\b/gi, '3.5 days');
    s = s.replace(new RegExp(`\\b(?:a\\s+couple(?:\\s+of)?|couple\\s+of)\\s+(${UNIT})\\b`, 'gi'), (m, u) => `2 ${u}`);
    s = s.replace(new RegExp(`\\b(?:a\\s+few|several)\\s+(${UNIT})\\b`, 'gi'), (m, u) => `3 ${u}`);
    s = s.replace(new RegExp(`\\b(in|for|after|every|each|than|and|within|next)\\s+(?:an?|one)\\s+(${UNIT})\\b`, 'gi'), (m, w, u) => (/^(every|each)$/i.test(w) ? `${w} ${u}` : `${w} 1 ${u}`));
    s = s.replace(new RegExp(`(?:^|\\s)(?:an?)\\s+(${UNIT})\\s+(from now|later)\\b`, 'gi'), (m, u, w) => ` 1 ${u} ${w}`);
    // number words before a unit, a time, or "times":  six hours, twenty five minutes, three times, five pm
    s = s.replace(new RegExp(`\\b(${NUMWORD})(?=\\s*(?:${UNIT}|times?|x\\b|am\\b|pm\\b|o'?clock|:\\d))`, 'gi'), (m, n) => String(wordNum(n)));
    s = s.replace(new RegExp(`\\b(?:at|by|around|until|till|before|after)\\s+(${NUMWORD})\\b(?!\\s+(?:more|other|least|most))`, 'gi'), (m) => m.replace(new RegExp(NUMWORD, 'i'), n => String(wordNum(n))));
    // "the first of the month", "the fifteenth", "on the last day"
    s = s.replace(new RegExp(`\\bthe\\s+(${Object.keys(ORD_WORDS).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi'), (m, w) => `the ${ord(ORD_WORDS[w.toLowerCase()])}`);
    // "3 days from now", "2 hours later" -> "in 3 days"
    s = s.replace(new RegExp(`(?:^|\\s)(${DUR_CHAIN})\\s+(?:from\\s+now|later|from\\s+today)\\b`, 'gi'), (m, c) => ` in ${c}`);
    return s;
  }

  /* ---------------------------------------------------------------- what kind of thing is it? (an icon that fits) */
  const ICON_RULES = [
    [/\b(grocer(y|ies)|shopping|supermarket|market|buy|purchase|order|pick up|store)\b/i, 'fa-cart-shopping'],
    [/\b(call|phone|ring|dial|text|facetime)\b/i, 'fa-phone'],
    [/\b(e-?mail|inbox|reply|message|send (?:a )?letter)\b/i, 'fa-envelope'],
    [/\b(gym|workout|work out|exercise|run|jog|lift|swim|yoga|stretch|train(ing)?)\b/i, 'fa-dumbbell'],
    [/\b(doctor|dentist|dental|medic(ine|ation)?|pills?|prescription|therapy|therapist|checkup|check-up|vitamin|physio|clinic)\b/i, 'fa-heart-pulse'],
    [/\b(flights?|fly|flying|airport|trip|travel|pack|passport|hotel|vacation|holiday)\b/i, 'fa-plane'],
    [/\b(birthday|b-?day|gift|present|anniversary|party|wedding)\b/i, 'fa-gift'],
    [/\b(coffee|tea|breakfast|lunch|dinner|brunch|cook|meal prep)\b/i, 'fa-mug-hot'],
    [/\b(meeting|standup|stand-up|boss|report|office|client|presentation|deadline|invoice the|work)\b/i, 'fa-briefcase'],
    [/\b(study|homework|exam|class|lecture|school|assignment|read|course|quiz)\b/i, 'fa-graduation-cap'],
    [/\b(rent|bills?|bank|tax(es)?|pay|payment|money|budget|insurance|subscription|transfer)\b/i, 'fa-money-bill'],
    [/\b(clean|laundry|dishes|trash|garbage|recycl(e|ing)|vacuum|tidy|mop|sweep|chores?|house)\b/i, 'fa-house'],
    [/\b(dog|cat|pet|vet|puppy|kitten|feed the|walk the)\b/i, 'fa-paw'],
    [/\b(water the|plants?|garden|mow|lawn|weed|flowers?)\b/i, 'fa-leaf'],
    [/\b(code|deploy|commit|merge|bug|pull request|pr review|ship)\b/i, 'fa-code'],
    [/\b(music|practice|piano|guitar|band|rehears(e|al)|drums?|violin|sing)\b/i, 'fa-music'],
    [/\b(keys?|lock|car|oil change|renew|license|registration)\b/i, 'fa-key'],
    [/\b(idea|brainstorm|think about|plan)\b/i, 'fa-lightbulb']
  ];
  ICON_RULES.forEach(r => { r[0] = new RegExp(r[0].source.replace(/\)\\b$/, ')s?\\b'), 'i'); });
  function iconFor(text) {
    for (const [re, ic] of ICON_RULES) if (re.test(text)) return ic;
    return '';
  }

  /* ---------------------------------------------------------------- the reader */
  function parse(text, nowIn) {
    const res = { due: null, repeat: null, endText: null, snooze: null, urgency: null, checklist: null, icon: '',
                  dateSet: false, timeSet: false, cleanTitle: text, matched: false, _exact: null };
    if (!text || !text.trim()) return res;
    const now = nowIn ? new Date(nowIn) : new Date();
    let work = ' ' + text + ' ';
    let m;
    const strip = re => { const mm = work.match(re); if (mm) work = work.replace(mm[0], ' '); return mm; };

    // the opening words that only say "make a reminder": "remind me to", "don't forget to", "i need to"
    const lead = /^\s*(?:(?:please|pls|hey|ok(?:ay)?)[\s,]+)?(?:remind\s+me|set\s+(?:a\s+)?reminder|reminder|remember|don'?t\s+forget|do\s+not\s+forget|make\s+sure\s+(?:i|to)|i\s+(?:need|have|got|ought|must|should|want|gotta)\s+to|i\s+gotta|need\s+to|gotta)\b[\s,:]*(?:to\b|that\b|about\b|of\b)?/i;
    const hadLead = lead.test(work);
    work = work.replace(lead, ' ');
    work = normalize(work);

    /* ---- CHECKLIST: last words of the sentence, so it is taken before the rest is read ---- */
    let lm = work.match(/\b(?:make|create|add|start|build|set\s*up)\s+(?:me\s+)?(?:a|an|the)?\s*(?:shopping\s+list|checklist|check\s*list|to-?do\s*list|list)\s*(?:containing|contains|of|with|that\s+has|having|including|include|:|-|–|=)?\s*(.+)$/i);
    if (!lm) lm = work.match(/\b(?:checklist|check\s*list|to-?do\s*list)\s*(?:containing|contains|of|with|that\s+has|having|including|:|-|–|=)?\s*(.+)$/i);
    let listTail = null;
    if (lm && lm[1] && lm[1].trim()) { listTail = lm; work = work.replace(lm[0], ' @@LIST@@ '); }

    /* ---- REMIND ME AGAIN (snooze): "remind me again in 10 minutes", "snooze for half an hour", "nag me every 5 min" ---- */
    if ((m = strip(new RegExp(`\\b(?:remind\\s+me\\s+again|snooze(?:\\s+for)?|nag\\s+me|ping\\s+me\\s+again|and\\s+again|then\\s+again)\\s+(?:in|after|every|each)?\\s*(${DUR_CHAIN})`, 'i')))) {
      res.snooze = chainLabel(chainParts(m[1]));
    }

    /* ---- REPEAT ---- */
    const named = { minute: 'Every minute', hour: 'Hourly', day: 'Every day', week: 'Every week', month: 'Every month', year: 'Every year' };
    const everyOf = parts => parts.length === 1 && parts[0].n === 1 ? named[parts[0].unit]
      : parts.length === 1 && Number.isInteger(parts[0].n) ? `Every ${parts[0].n} ${parts[0].unit}s` : 'Every ' + chainLabel(parts);
    let repeatDays = null;       // weekdays a repeat names, so the first date can be the next one of them
    let monthDay = null;         // a day of the month a repeat names
    if ((m = strip(new RegExp(`\\bevery\\s+other\\s+(${DAY})\\b`, 'i')))) {
      res.repeat = 'Every other ' + DAYNAMES[dayIndex(m[1])]; repeatDays = [dayIndex(m[1])];
    } else if ((m = strip(/\bevery\s+other\s+(minute|min|hour|hr|day|week|month|year)s?\b/i))) {
      res.repeat = `Every 2 ${unitOf(m[1])}s`;
      if (unitOf(m[1]) === 'week' && (m = strip(new RegExp(`\\b(?:on\\s+)?(${DAY}(?:\\s*(?:,|and|&|\\/)\\s*${DAY})*)s?\\b`, 'i')))) { repeatDays = dayList(m[1]); res.repeat += ' on ' + listWords(repeatDays.map(i => DAYNAMES[i])); }
    } else if ((m = strip(new RegExp(`\\bevery\\s+(\\d+)\\s*(weeks?|wks?)\\s+(?:on\\s+)?(${DAY}(?:\\s*(?:,|and|&|\\/)\\s*${DAY})*)s?\\b`, 'i')))) {
      repeatDays = dayList(m[3]); const n = +m[1];
      res.repeat = (n === 1 ? 'Every week' : `Every ${n} weeks`) + ' on ' + listWords(repeatDays.map(i => DAYNAMES[i]));
    } else if ((m = strip(new RegExp(`\\b(?:every|each)\\s+(${DAY}(?:\\s*(?:,|and|&|\\/)\\s*${DAY})*)s?\\b`, 'i')))) {
      repeatDays = dayList(m[1]); res.repeat = 'Every ' + listWords(repeatDays.map(i => DAYNAMES[i]));
    } else if ((m = strip(new RegExp(`\\b(?:on\\s+)?(${DAY}s(?:\\s*(?:,|and|&|\\/)\\s*${DAY}s?)*)\\b`, 'i')))) {      // "gym on mondays and wednesdays"
      repeatDays = dayList(m[1]); res.repeat = 'Every ' + listWords(repeatDays.map(i => DAYNAMES[i]));
    } else if (strip(/\b(?:every|each)\s+weekdays?\b|\bweekdays\b|\bon\s+weekdays\b/i)) {
      res.repeat = 'Every weekday';
    } else if (strip(/\b(?:every|each)\s+weekends?\b|\bweekends\b|\bon\s+weekends\b/i)) {
      res.repeat = 'Every weekend'; repeatDays = [6];
    } else if ((m = strip(/\b(?:on\s+)?the\s+last\s+day\s+of\s+(?:every|each)\s+month\b|\b(?:every|each)\s+month\s+on\s+the\s+last\s+day\b/i))) {
      res.repeat = 'Every month on the last day'; monthDay = 'last';
    } else if ((m = strip(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)(?:\s*(?:,|and|&)\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th))?\s+(?:of\s+)?(?:every|each)\s+month\b|\b(?:every|each)\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)(?:\s*(?:,|and|&)\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th))?|\bmonthly\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)/i))) {
      const days = [m[1], m[2], m[3], m[4], m[5]].filter(Boolean).map(Number);
      res.repeat = 'Every month on the ' + listWords(days.map(ord)); monthDay = days;
    } else if ((m = strip(/\b(once|twice|thrice|\d+\s*(?:x|times))\s+(?:a|an|per|each|every)\s+(hour|day|week|month|year)\b/i))) {
      const k = /^once/i.test(m[1]) ? 1 : /^twice/i.test(m[1]) ? 2 : /^thrice/i.test(m[1]) ? 3 : parseInt(m[1]), u = m[2].toLowerCase();
      if (k === 1) res.repeat = named[u];
      else if (u === 'day' && 24 % k === 0) res.repeat = `Every ${24 / k} hours`;
      else if (u === 'hour' && 60 % k === 0) res.repeat = `Every ${60 / k} minutes`;
      else res.repeat = `${k} times a ${u}`;
    } else if ((m = strip(/\b(?:every|each)\s+(morning|afternoon|evening|night)\b/i))) {
      res.repeat = 'Every day'; res._partOfDay = m[1].toLowerCase();
    } else if ((m = strip(new RegExp(`\\b(?:every|each)\\s+(${DUR_CHAIN})`, 'i')))) {
      res.repeat = everyOf(chainParts(m[1]));
    } else if (strip(/\bevery\s+weekday(s)?\b/i)) {
      res.repeat = 'Every weekday';
    } else if (strip(/\bbi-?weekly\b|\bfortnightly\b/i)) {
      res.repeat = 'Every 2 weeks';
    } else if (strip(/\bbi-?monthly\b/i)) {
      res.repeat = 'Every 2 months';
    } else if ((m = strip(/\b(hourly|daily|nightly|weekly|monthly|yearly|annually|quarterly)\b/i))) {
      res.repeat = { hourly: 'Hourly', daily: 'Every day', nightly: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year', annually: 'Every year', quarterly: 'Every 3 months' }[m[1].toLowerCase()];
    } else if ((m = strip(/\b(?:every|each)\s+(hour|day|week|month|year)\b/i))) {
      res.repeat = named[m[1].toLowerCase()];
    } else if (strip(/\b(?:every|each)\s+quarter\b/i)) {
      res.repeat = 'Every 3 months';
    }
    strip(/\brepeat(s|ing|ed)?\b/i);
    strip(/\bremind me(?:\s+again)?\b/i);

    /* ---- WHEN THE REPEAT ENDS: "for 5 times", "until dec 25", "for the next 3 weeks", "5 times" ---- */
    if (res.repeat) {
      if ((m = strip(/\b(?:for\s+(?:the\s+next\s+)?|after\s+|x\s*)?(\d+)\s*(?:x|times?|occurrences?)\b/i))) res.endText = `After ${+m[1]} time${+m[1] === 1 ? '' : 's'}`;
      else if ((m = strip(new RegExp(`\\b(?:until|till|til|through|thru|ending(?:\\s+on)?|ends?(?:\\s+on)?)\\s+(?:on\\s+|the\\s+)?(${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:,?\\s+\\d{4})?|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2}|end\\s+of\\s+(?:the\\s+)?(?:week|month|year)|tomorrow|next\\s+(?:week|month|year|${DAY})|${DAY})\\b`, 'i')))) {
        res.endText = m[1].replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
      } else if ((m = strip(new RegExp(`\\b(?:for|over)\\s+(?:the\\s+next\\s+)?(${DUR_CHAIN})`, 'i')))) res.endText = chainLabel(chainParts(m[1]));
    }

    /* ---- URGENCY ---- */
    const urgMap = { critical: 'critical', urgent: 'critical', high: 'high', medium: 'medium', moderate: 'medium', normal: 'medium', low: 'low', none: 'none', no: 'none' };
    let um = strip(/\b(critical|urgent|high|medium|moderate|normal|low|no)\s+(?:urgency|priority)\b/i)
          || strip(/\b(?:urgency|priority)\s*[:=]?\s*(critical|urgent|high|medium|moderate|normal|low|none)\b/i);
    if (um) res.urgency = urgMap[um[1].toLowerCase()] || null;
    else if (strip(/\b(?:top\s+priority|extremely\s+important|super\s+urgent|emergency)\b/i)) res.urgency = 'critical';
    else if (strip(/\b(urgent|asap|immediately|right\s+away)\b/i)) res.urgency = 'critical';
    else if (strip(/\b(?:very\s+|really\s+)?important\b/i)) res.urgency = 'high';
    else if (strip(/\b(?:no\s+rush|whenever(?:\s+you\s+can)?|low\s+key|not\s+urgent)\b/i)) res.urgency = 'low';

    /* ---- DATE ---- */
    let dd = null, mo = null, yy = null, tonight = false;
    const setD = d => { dd = d.getDate(); mo = d.getMonth(); yy = d.getFullYear(); res.dateSet = true; };
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeekday = (idx, allowToday) => {
      const d = new Date(now); let diff = (idx - d.getDay() + 7) % 7; if (diff === 0 && !allowToday) diff = 7; d.setDate(d.getDate() + diff); return d;
    };

    if ((m = strip(new RegExp(`\\bin\\s+(${DUR_CHAIN})`, 'i')))) {                       // in 6 hours, in 2 hours 30 minutes, in 1 day 3 hours, in 2 weeks
      const parts = chainParts(m[1]), d = addParts(now, parts);
      setD(d);
      if (parts.some(p => p.unit === 'hour' || p.unit === 'minute')) { res.timeSet = true; res._exact = d; }
    }
    else if (strip(/\btonight\b/i)) { setD(now); tonight = true; }
    else if (strip(/\bday\s+after\s+(?:tomorrow|tmrw)\b/i)) { const d = new Date(now); d.setDate(d.getDate() + 2); setD(d); }
    else if (strip(/\btoday\b/i)) { setD(now); }
    else if (strip(/\b(tomorrow|tmrw|tmr)\b/i)) { const d = new Date(now); d.setDate(d.getDate() + 1); setD(d); }
    else if (strip(/\bnext\s+week\b/i)) { const d = new Date(now); d.setDate(d.getDate() + 7); setD(d); }
    else if (strip(/\bnext\s+month\b/i)) { const d = new Date(now); d.setMonth(d.getMonth() + 1); setD(d); }
    else if (strip(/\bnext\s+year\b/i)) { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); setD(d); }
    else if (strip(/\b(?:this|next|the)\s+weekend\b|\bon\s+the\s+weekend\b/i)) { setD(nextWeekday(6, true)); }
    else if (strip(/\bend\s+of\s+(?:the\s+)?week\b/i)) { setD(nextWeekday(5, true)); if (!res._eodDefault) res._eodDefault = true; }
    else if (strip(/\bend\s+of\s+(?:the\s+)?month\b/i)) { setD(new Date(now.getFullYear(), now.getMonth() + 1, 0)); res._eodDefault = true; }
    else if (strip(/\bend\s+of\s+(?:the\s+)?year\b/i)) { setD(new Date(now.getFullYear(), 11, 31)); res._eodDefault = true; }
    else if ((m = strip(new RegExp(`\\b(?:next\\s+|this\\s+|on\\s+)?(${DAY})\\b`, 'i')))) {
      setD(nextWeekday(dayIndex(m[1]), false));
    }
    else if ((m = strip(new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'))) || (m = strip(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})(?:,?\\s+(\\d{4}))?\\b`, 'i')))) {
      const mname = /^\d/.test(m[1]) ? m[2] : m[1], dnum = /^\d/.test(m[1]) ? m[1] : m[2];
      mo = MONTHS.indexOf(mname.toLowerCase().slice(0, 3)); dd = parseInt(dnum);
      yy = m[3] ? parseInt(m[3]) : now.getFullYear();
      if (!m[3] && new Date(yy, mo, dd) < startOfToday) yy++;
      res.dateSet = true;
    }
    else if ((m = strip(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { yy = +m[1]; mo = +m[2] - 1; dd = +m[3]; res.dateSet = true; }
    else if ((m = strip(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i))) {
      dd = parseInt(m[1]); mo = now.getMonth(); yy = now.getFullYear();
      if (dd < now.getDate()) mo++;
      res.dateSet = true;
    }
    else if ((m = strip(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      mo = parseInt(m[1]) - 1; dd = parseInt(m[2]);
      yy = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : now.getFullYear();
      res.dateSet = true;
    }
    // a repeat that names its own day: the first reminder is the next such day
    if (!res.dateSet && repeatDays && repeatDays.length) {
      const soonest = repeatDays.map(i => nextWeekday(i, false)).sort((a, b) => a - b)[0]; setD(soonest);
    }
    if (!res.dateSet && monthDay != null) {
      const want = monthDay === 'last' ? [0] : monthDay;
      let best = null;
      for (let add = 0; add < 3 && !best; add++) {
        want.forEach(dn => {
          const d = dn === 0 ? new Date(now.getFullYear(), now.getMonth() + add + 1, 0) : new Date(now.getFullYear(), now.getMonth() + add, dn);
          if (d >= startOfToday && (!best || d < best)) best = d;
        });
      }
      if (best) setD(best);
    }

    /* ---- TIME ---- */
    let hh = null, mi = null;
    const pmAdjust = (h, mer) => { h = h % 12; return /^p/i.test(mer) ? h + 12 : h; };
    const MER = '(?:\\s*(am|pm|a\\.m\\.|p\\.m\\.)|\\s+in\\s+the\\s+(morning|afternoon|evening)|\\s+at\\s+night)?';
    const merOf = mm => mm[mm.length - 2] || mm[mm.length - 1] ? (/^(p|a)/i.test(mm[mm.length - 2] || '') ? mm[mm.length - 2] : /morning/i.test(mm[mm.length - 1] || '') ? 'am' : /afternoon|evening/i.test(mm[mm.length - 1] || '') ? 'pm' : /^(am|pm)/i.test(mm[mm.length - 2] || '') ? mm[mm.length - 2] : null) : null;
    const clock = (h, mi_, mer) => { hh = mer ? pmAdjust(h, mer) : h; mi = mi_; res.timeSet = true; if(!mer) res._bare = true; };
    if ((m = strip(new RegExp(`\\bhalf\\s+past\\s+(\\d{1,2})\\b${MER}`, 'i')))) clock(+m[1], 30, merOf(m));
    else if ((m = strip(new RegExp(`\\bquarter\\s+past\\s+(\\d{1,2})\\b${MER}`, 'i')))) clock(+m[1], 15, merOf(m));
    else if ((m = strip(new RegExp(`\\bquarter\\s+(?:to|till|til|of)\\s+(\\d{1,2})\\b${MER}`, 'i')))) clock((+m[1] + 11) % 12 || 12, 45, merOf(m));
    else if ((m = strip(new RegExp(`\\b(\\d{1,2})\\s+minutes?\\s+(?:to|before|till)\\s+(\\d{1,2})\\b${MER}`, 'i')))) clock((+m[2] + 11) % 12 || 12, 60 - +m[1], merOf(m));
    else if ((m = strip(new RegExp(`\\b(\\d{1,2})\\s+minutes?\\s+(?:past|after)\\s+(\\d{1,2})\\b${MER}`, 'i')))) clock(+m[2], +m[1], merOf(m));
    else if ((m = strip(/\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i))) { hh = pmAdjust(parseInt(m[1]), m[3]); mi = m[2] ? parseInt(m[2]) : 0; res.timeSet = true; }
    else if ((m = strip(/\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:in\s+the\s+|at\s+)?(morning|afternoon|evening|night)\b/i))) {
      const mer = /morning/i.test(m[3]) ? 'am' : /night/i.test(m[3]) && +m[1] >= 6 && +m[1] <= 11 ? 'pm' : /night/i.test(m[3]) ? 'am' : 'pm';
      hh = pmAdjust(parseInt(m[1]), mer); mi = m[2] ? parseInt(m[2]) : 0; res.timeSet = true;
    }
    else if ((m = strip(/\b(\d{1,2})\s*o'?clock\b/i))) { hh = +m[1]; mi = 0; res.timeSet = true; res._bare = true; }
    else if ((m = strip(/\bat\s+(\d{1,2}):(\d{2})\b/i))) { hh = parseInt(m[1]); mi = parseInt(m[2]); res.timeSet = true; }
    else if ((m = strip(/\bat\s+([01]\d|2[0-3])([0-5]\d)\b/i))) { hh = parseInt(m[1]); mi = parseInt(m[2]); res.timeSet = true; }
    else if (strip(/\b(noon|midday)\b/i)) { hh = 12; mi = 0; res.timeSet = true; }
    else if (strip(/\bmidnight\b/i)) { hh = 0; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:end\s+of\s+(?:the\s+)?day|eod|close\s+of\s+business|cob)\b/i)) { hh = 17; mi = 0; res.timeSet = true; }
    else if (strip(/\bfirst\s+thing\b/i)) { hh = 8; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:lunch\s*time|at\s+lunch)\b/i)) { hh = 12; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:dinner\s*time|supper\s*time)\b/i)) { hh = 18; mi = 0; res.timeSet = true; }
    else if (strip(/\bbed\s*time\b/i)) { hh = 22; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:in\s+the\s+)?morning\b/i)) { hh = 9; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:in\s+the\s+)?afternoon\b/i)) { hh = 15; mi = 0; res.timeSet = true; }
    else if (strip(/\b(?:in\s+the\s+)?evening\b/i)) { hh = 19; mi = 0; res.timeSet = true; }
    else if (tonight) { hh = 19; mi = 0; res.timeSet = true; }
    else if (res._partOfDay) { hh = { morning: 9, afternoon: 15, evening: 19, night: 21 }[res._partOfDay]; mi = 0; res.timeSet = true; }
    else if ((m = strip(/\bat\s+(\d{1,2})\b(?!\s*(?:%|st|nd|rd|th|x))/i))) { hh = +m[1]; mi = 0; res.timeSet = true; res._bare = true; }
    // a bare hour ("at 5", "5 o'clock") has no am / pm: take the one that makes sense
    if (res._bare && hh !== null && hh >= 1 && hh <= 12) {
      const base = new Date(now); if (res.dateSet) { base.setFullYear(yy, mo, dd); }
      const am = new Date(base), pm = new Date(base); am.setHours(hh % 12, mi, 0, 0); pm.setHours(hh % 12 + 12, mi, 0, 0);
      if (hh === 12) hh = 12;
      else if (hh >= 7 && hh <= 11) hh = (!res.dateSet && am <= now && pm > now) ? hh + 12 : hh;
      else hh = hh + 12;
    }
    if (hh !== null && (hh > 23 || mi > 59)) { hh = null; mi = null; res.timeSet = false; }

    /* ---- BUILD DUE ---- */
    if (res._exact) {
      res.due = toLocalInput(res._exact);
      // "in 6 hours at 5pm"-style clashes: an explicit clock time wins over the hours offset
      if (hh !== null) { const d = new Date(res._exact); d.setHours(hh, mi, 0, 0); res.due = toLocalInput(d); }
    } else if (res.dateSet || res.timeSet) {
      const d = new Date(now);
      if (res.dateSet) d.setFullYear(yy, mo, dd);
      if (res.timeSet && hh !== null) d.setHours(hh, mi, 0, 0); else d.setHours(res._eodDefault ? 17 : 9, 0, 0, 0);
      if (res.timeSet && !res.dateSet && d < now) d.setDate(d.getDate() + 1);          // only a time, and it has passed today: tomorrow
      res.due = toLocalInput(d);
    }

    /* ---- CHECKLIST ITEMS ---- */
    if (listTail) {
      const raw = listTail[1].trim();
      const items = (/[,;\n]/.test(raw) ? raw.split(/\s*[,;\n]\s*|\s+and\s+/i) : raw.split(/\s*[;\n]\s*/))
        .map(s => s.replace(/^and\s+/i, '').trim()).filter(Boolean);
      if (items.length) res.checklist = items;
      else work = work.replace('@@LIST@@', ' ');
      work = work.replace('@@LIST@@', ' ');
    }

    /* ---- THE TITLE THAT IS LEFT ---- */
    let clean = work.replace(/[^\S\n]{2,}/g, ' ');
    clean = clean.replace(/[^\S\n]*[,;]+[^\S\n]*$/, '');
    clean = clean.replace(/[^\S\n]+(at|on|by|from|every|the|in|next|this|and|with|for|of|then|until)[^\S\n]*$/i, '');
    clean = clean.replace(/^[^\S\n]*(at|on|by)[^\S\n]+/i, '');
    clean = clean.replace(/^[\s,;]+|[\s,;]+$/g, '');
    clean = clean.replace(/[^\S\n]{2,}/g, ' ').trim();
    const matchedAny = !!(res.dateSet || res.timeSet || res.repeat || res.urgency || res.endText || res.snooze || (res.checklist && res.checklist.length));
    if (hadLead || matchedAny) clean = clean.replace(/^(?:to|that|about|and|then)\s+/i, '').replace(/\s+(?:and|then)$/i, '');
    res.cleanTitle = clean;
    if (matchedAny || hadLead) res.icon = iconFor(clean + ' ' + (res.checklist || []).join(' '));
    res.matched = matchedAny || hadLead;
    delete res._bare; delete res._partOfDay; delete res._eodDefault;
    return res;
  }

  const api = { parse, normalize, iconFor, toLocalInput, chainParts, chainLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RemNLP = api;
})(typeof window !== 'undefined' ? window : globalThis);
