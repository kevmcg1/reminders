// The version of Reminders and what changed in each one, read by changelog.js (the chip under the logo and the What's new list).
// To release: add an entry to the top of `changelog`, set `version` to match, and raise the ?v=N on this file's <script> tag in index.html.
// Keep ONE entry per day, and each entry to ONE short, simple sentence: if today already has an entry, add to its sentence instead of a new entry.
window.__REM = {
  version: '1.2.0',
  changelog: [
    { v: '1.2.0', date: '2026-10-26', title: 'Notifications', items: ['Turn on push notifications in Settings to get a notification when a reminder is due, with a button that shows how to turn them off in your browser, and a pop up reminds you the tab has to stay open.'] },
    { v: '1.1.1', date: '2026-10-25', title: 'Smarter typing', items: ['Typing remind me to keeps your words as the title and sets the time, change the time to 5:41 PM edits a reminder, the guides explain both, and tall dialogs now scroll instead of getting cut off, and the dev tool has a Speed coder mode and tests for all of it.'] },
    { v: '1.1.0', date: '2026-10-23', title: 'Walkthrough, new look and no notifications', items: ['Added a How do I use this? walkthrough, a changelog, the site header and footer, a new logo and a note on where reminders are saved, and removed notifications.'] },
    { v: '1.0.0', date: '', title: 'First release', items: ['An easy reminders app: type a date the way you say it, repeat, checklists, themes, search, and import or export.'] }
  ]
};
