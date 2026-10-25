// node tests/nlp.test.js   — reads sentences with a fixed clock (Wed 2026-10-28 10:00) and checks what gets filled in.
const { parse } = require('../nlp.js');
const NOW = new Date(2026, 9, 28, 10, 0, 0);            // Wednesday
const at = (y, mo, d, h, mi) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
let pass = 0, fail = 0;
const T = (text, want) => {
  const r = parse(text, NOW), bad = [];
  Object.keys(want).forEach(k => { const got = r[k] === undefined ? undefined : r[k]; if (JSON.stringify(got) !== JSON.stringify(want[k])) bad.push(`${k}: wanted ${JSON.stringify(want[k])}, got ${JSON.stringify(got)}`); });
  if (bad.length) { fail++; console.log('✘ ' + JSON.stringify(text) + '\n    ' + bad.join('\n    ')); } else pass++;
};

// the example
T('remind me in six hours to get groceries', { due: at(2026, 10, 28, 16, 0), cleanTitle: 'get groceries', icon: 'fa-cart-shopping', repeat: null });
// number words and loose amounts
T('remind me to call mom in an hour', { due: at(2026, 10, 28, 11, 0), cleanTitle: 'call mom', icon: 'fa-phone' });
T('in half an hour take the pills', { due: at(2026, 10, 28, 10, 30), cleanTitle: 'take the pills', icon: 'fa-heart-pulse' });
T('in an hour and a half check the oven', { due: at(2026, 10, 28, 11, 30), cleanTitle: 'check the oven' });
T('in two and a half hours stretch', { due: at(2026, 10, 28, 12, 30) });
T('in a couple of hours water the plants', { due: at(2026, 10, 28, 12, 0), icon: 'fa-leaf' });
T('in a few minutes check email', { due: at(2026, 10, 28, 10, 3), icon: 'fa-envelope' });
T('in twenty five minutes move the car', { due: at(2026, 10, 28, 10, 25) });
T('3 hours from now call the bank', { due: at(2026, 10, 28, 13, 0), cleanTitle: 'call the bank' });
T('buy milk 45 minutes later', { due: at(2026, 10, 28, 10, 45), cleanTitle: 'buy milk' });
// compound intervals
T('remind me in 2 hours and 30 minutes to stand up', { due: at(2026, 10, 28, 12, 30), cleanTitle: 'stand up' });
T('in 1 day 3 hours submit report', { due: at(2026, 10, 29, 13, 0) });
T('in 2 weeks renew passport', { due: at(2026, 11, 11, 9, 0) });
T('in 3 days at 5pm pick up the package', { due: at(2026, 10, 31, 17, 0), cleanTitle: 'pick up the package' });
T('in 1h 15m check the laundry', { due: at(2026, 10, 28, 11, 15), icon: 'fa-house' });
// dates and times
T('dentist tomorrow at 2:30pm', { due: at(2026, 10, 29, 14, 30), cleanTitle: 'dentist', icon: 'fa-heart-pulse' });
T('lunch with sam the day after tomorrow at noon', { due: at(2026, 10, 30, 12, 0) });
T('remind me next week to book flights', { due: at(2026, 11, 4, 9, 0), icon: 'fa-plane' });
T('trash out friday at half past 7 in the evening', { due: at(2026, 10, 30, 19, 30) });
T('call the vet at quarter to 5', { due: at(2026, 10, 28, 16, 45) });
T('standup at 9 tomorrow', { due: at(2026, 10, 29, 9, 0) });
T('gym at 6 tomorrow', { due: at(2026, 10, 29, 18, 0) });
T('meeting dec 25 at 3 o\'clock', { due: at(2026, 12, 25, 15, 0) });
T('party the 15th of march 2027', { due: at(2027, 3, 15, 9, 0), icon: 'fa-gift' });
T('taxes by the end of the month', { due: at(2026, 10, 31, 17, 0), icon: 'fa-money-bill' });
T('send invoice eod friday', { due: at(2026, 10, 30, 17, 0) });
T('brunch this weekend', { due: at(2026, 10, 31, 9, 0), icon: 'fa-mug-hot' });
T('2026-12-01 pay rent', { due: at(2026, 12, 1, 9, 0), cleanTitle: 'pay rent' });
// repeats, including the harder ones
T('take vitamins every day at 8am', { repeat: 'Every day', due: at(2026, 10, 29, 8, 0), icon: 'fa-heart-pulse' });
T('take vitamins every morning', { repeat: 'Every day', due: at(2026, 10, 29, 9, 0) });
T('water plants every monday and thursday', { repeat: 'Every Monday and Thursday', due: at(2026, 10, 29, 9, 0) });
T('gym on mondays, wednesdays and fridays', { repeat: 'Every Monday, Wednesday and Friday', due: at(2026, 10, 30, 9, 0) });
T('trash every other friday', { repeat: 'Every other Friday', due: at(2026, 10, 30, 9, 0) });
T('team sync every 2 weeks on tuesday at 10am', { repeat: 'Every 2 weeks on Tuesday', due: at(2026, 11, 3, 10, 0) });
T('review budget every month on the 15th', { repeat: 'Every month on the 15th', due: at(2026, 11, 15, 9, 0) });
T('pay rent on the 1st of every month', { repeat: 'Every month on the 1st', due: at(2026, 11, 1, 9, 0) });
T('invoice on the last day of every month', { repeat: 'Every month on the last day', due: at(2026, 10, 31, 9, 0) });
T('stretch every 90 minutes', { repeat: 'Every 90 minutes' });
T('drink water every 2 hours 30 minutes', { repeat: 'Every 2 hours 30 minutes' });
T('stretch every hour and a half', { repeat: 'Every 1.5 hours' });
T('take meds twice a day', { repeat: 'Every 12 hours' });
T('take meds three times a day', { repeat: 'Every 8 hours' });
T('weekdays at 8:45am standup', { repeat: 'Every weekday', due: at(2026, 10, 29, 8, 45) });
T('every weekend clean the garage', { repeat: 'Every weekend', due: at(2026, 10, 31, 9, 0) });
T('floss nightly', { repeat: 'Every day' });
T('check mail every 3 days for 5 times', { repeat: 'Every 3 days', endText: 'After 5 times' });
T('weekly review until dec 25', { repeat: 'Every week', endText: 'Dec 25' });
T('walk the dog every day for the next 3 weeks', { repeat: 'Every day', endText: '3 weeks', icon: 'fa-paw' });
// remind again, urgency, lists
T('call mom tomorrow at 9am and remind me again in 10 minutes', { due: at(2026, 10, 29, 9, 0), snooze: '10 minutes', cleanTitle: 'call mom' });
T('submit taxes friday, urgent', { urgency: 'critical', due: at(2026, 10, 30, 9, 0) });
T('this is very important call lawyer in 2 hours', { urgency: 'high', due: at(2026, 10, 28, 12, 0) });
T('remind me tomorrow to make a list of bread, eggs and milk', { checklist: ['bread', 'eggs', 'milk'], due: at(2026, 10, 29, 9, 0) });
// things that must stay as they were
T('buy milk', { matched: false, due: null, cleanTitle: 'buy milk' });
T('read chapter one', { matched: false });
T('call mom tomorrow at 9am', { due: at(2026, 10, 29, 9, 0), cleanTitle: 'call mom' });
T('standup at 2 pm repeat hourly', { repeat: 'Hourly' });
T('in 5 mins stretch', { due: at(2026, 10, 28, 10, 5), cleanTitle: 'stretch' });
T('every 3 days check plants', { repeat: 'Every 3 days' });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
