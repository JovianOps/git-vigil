const DAY_MS = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CONFESSIONS = [
  [/\bwip\b/i, 'wip'],
  [/\bwhoops\b/i, 'whoops'],
  [/\btypo\b/i, 'typo'],
  [/\bforgot\b/i, 'forgot'],
  [/\bsorry\b/i, 'sorry'],
  [/\bfix(?:es|ed|ing)?\b/i, 'fix'],
  [/\brevert(?:s|ed|ing)?\b/i, 'revert'],
  [/\bagain\b/i, 'again'],
  [/\bstill\b/i, 'still'],
  [/\bbroken\b/i, 'broken'],
  [/\bcrash(?:es|ed|ing)?\b/i, 'crash'],
  [/\bdoes ?n[o']?t work\b/i, "doesn't work"],
  [/\bhelp\b/i, 'help'],
  [/\bwhy\b/i, 'why'],
  [/\bhack(?:s|y)?\b/i, 'hack'],
  [/\btemporar(?:y|ies)\b/i, 'temporary'],
  [/\btodo\b/i, 'todo'],
  [/\bfinal(?:ly)?\b/i, 'final'],
  [/\blast (?:try|attempt|time|chance)\b/i, 'last try'],
  [/\bdamn\b|\bshit\b|\bcrap\b|\bgod(?:damn)?\b/i, 'a swear'],
  [/\bplease\b/i, 'please'],
  [/\bnever\b/i, 'never'],
];

const DRAMA = /(whoops|sorry|please|why|help|damn|shit|crap|god|broken|crash|never|again|still|last|final|dead|hack|wip|revert|typo|forgot|midnight|3am|4am)/i;

// Prescreening keeps 22 confession patterns off commits that match none of them.
const PRESCREEN = new RegExp(`${CONFESSIONS.map(([re]) => re.source).join('|')}|${DRAMA.source}`, 'i');

const DAY_OF_WEEK = new Map();

function weekdayOf(iso) {
  let cached = DAY_OF_WEEK.get(iso);
  if (cached === undefined) {
    cached = new Date(`${iso}T12:00:00Z`).getUTCDay();
    DAY_OF_WEEK.set(iso, cached);
  }
  return cached;
}

function toDayNumber(iso) {
  return Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY_MS);
}

function formatClock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dated(commit) {
  return !Number.isNaN(toDayNumber(commit.date));
}

function longestStreak(daySet) {
  let best = 0;
  let bestEnd = null;
  for (const day of daySet) {
    if (daySet.has(day - 1)) continue;
    let length = 0;
    let cursor = day;
    while (daySet.has(cursor)) {
      length += 1;
      cursor += 1;
    }
    if (length > best) {
      best = length;
      bestEnd = cursor - 1;
    }
  }
  return { length: best, endDay: bestEnd };
}

function analyze(repo) {
  const commits = repo.commits
    .filter(dated)
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour || a.minute - b.minute || a.hash.localeCompare(b.hash));
  const unreadableDates = repo.commits.length - commits.length;

  if (!commits.length) {
    return { empty: true, repoName: repo.repoName, branch: repo.branch, read: repo.commits.length, unreadableDates };
  }

  const first = commits[0];
  const latest = commits[commits.length - 1];

  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const perDay = new Map();
  const perAuthor = new Map();
  const allFiles = new Set();
  const confessionCounts = new Map();
  const dramatic = [];
  let insertions = 0;
  let deletions = 0;
  let statsCovered = 0;
  let nightCount = 0;
  let weekendCount = 0;
  let deepest = null;

  for (const commit of commits) {
    const minutes = commit.hour * 60 + commit.minute;
    const wd = weekdayOf(commit.date);
    const isNight = commit.hour < 5;
    const isWeekend = wd === 0 || wd === 6;

    hours[commit.hour] += 1;
    weekdays[wd] += 1;
    if (commit.insertions !== null) {
      statsCovered += 1;
      insertions += commit.insertions;
      deletions += commit.deletions;
      for (const file of commit.files) allFiles.add(file);
    }

    if (isNight) {
      nightCount += 1;
      if (!deepest || commit.hour > deepest.hour || (commit.hour === deepest.hour && commit.minute > deepest.minute)) deepest = commit;
    }
    if (isWeekend) weekendCount += 1;

    let day = perDay.get(commit.date);
    if (!day) {
      day = { date: commit.date, count: 0, night: 0, weekend: 0, min: minutes, max: minutes };
      perDay.set(commit.date, day);
    }
    day.count += 1;
    if (minutes < day.min) day.min = minutes;
    if (minutes > day.max) day.max = minutes;
    if (isNight) day.night += 1;
    if (isWeekend) day.weekend += 1;

    let person = perAuthor.get(commit.email);
    if (!person) {
      person = { name: commit.author, email: commit.email, commits: 0, night: 0, first: commit, last: commit };
      perAuthor.set(commit.email, person);
    }
    person.commits += 1;
    if (isNight) person.night += 1;
    person.last = commit;

    if (PRESCREEN.test(commit.subject)) {
      for (const [pattern, label] of CONFESSIONS) {
        if (pattern.test(commit.subject)) confessionCounts.set(label, (confessionCounts.get(label) || 0) + 1);
      }
      if (DRAMA.test(commit.subject) && commit.subject.length > 3) dramatic.push(commit);
    }
  }

  const dayNumbers = new Set(Array.from(perDay.keys(), toDayNumber));
  const best = longestStreak(dayNumbers);
  const lastDay = toDayNumber(latest.date);
  let trailing = 0;
  for (let cursor = lastDay; dayNumbers.has(cursor); cursor -= 1) trailing += 1;

  const you =
    perAuthor.get(repo.identity.email) ||
    [...perAuthor.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))[0];

  const days = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const longDays = days.filter((day) => day.max - day.min >= 600).sort((a, b) => b.max - b.min - (a.max - a.min));
  const busiest = days.reduce((top, day) => (top === null || day.count > top.count ? day : top), null);

  // One human can hold several emails; a person only goes quiet when every address does.
  const byName = new Map();
  for (const person of perAuthor.values()) {
    const key = person.name.trim().toLowerCase() || person.email;
    let merged = byName.get(key);
    if (!merged) {
      merged = { name: person.name.trim(), commits: 0, night: 0, first: person.first, last: person.last, emails: new Set() };
      byName.set(key, merged);
    }
    merged.commits += person.commits;
    merged.night += person.night;
    merged.emails.add(person.email);
    if (person.first.date < merged.first.date) merged.first = person.first;
    if (person.last.date > merged.last.date) merged.last = person.last;
  }

  const people = [...byName.values()]
    .map((person) => ({
      name: person.name,
      commits: person.commits,
      night: person.night,
      aliases: person.emails.size,
      share: Math.round((person.commits / commits.length) * 100),
      firstDate: person.first.date,
      lastDate: person.last.date,
      lastMessage: person.last.subject,
      gapDays: Math.max(0, lastDay - toDayNumber(person.last.date)),
    }))
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));

  return {
    empty: false,
    repoName: repo.repoName,
    branch: repo.branch,
    unreadableDates,
    unreadableRecords: repo.unreadable || 0,
    truncated: Boolean(repo.capped),
    totals: {
      commits: commits.length,
      commitsAll: repo.totalCommits || commits.length,
      people: people.length,
      files: allFiles.size,
      insertions,
      deletions,
      activeDays: perDay.size,
      spanDays: lastDay - toDayNumber(first.date) + 1,
      firstDate: first.date,
      firstMessage: first.subject,
      firstAuthor: first.author,
      lastDate: latest.date,
    },
    hours,
    weekdays,
    days: days.map((day) => [day.date, day.count, day.night, day.weekend]),
    night: {
      count: nightCount,
      pct: Math.round((nightCount / commits.length) * 100),
      deepest: deepest && {
        date: deepest.date,
        clock: formatClock(deepest.hour, deepest.minute),
        subject: deepest.subject,
        author: deepest.author,
      },
    },
    weekend: { count: weekendCount, pct: Math.round((weekendCount / commits.length) * 100) },
    streaks: {
      best: best.length,
      bestEnd: best.endDay === null ? null : new Date(best.endDay * DAY_MS).toISOString().slice(0, 10),
      trailing,
    },
    weight: {
      window: { covered: statsCovered, total: commits.length },
      longDays: longDays.length,
      longestDay: longDays[0] && {
        date: longDays[0].date,
        hours: Math.floor(((longDays[0].max - longDays[0].min) / 60) * 10) / 10,
        commits: longDays[0].count,
      },
      busiest: busiest && { date: busiest.date, commits: busiest.count },
      perActiveDay: Math.round((commits.length / perDay.size) * 10) / 10,
    },
    confession: {
      counts: [...confessionCounts].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
      samples: dramatic
        .sort((a, b) => b.date.localeCompare(a.date) || b.subject.length - a.subject.length)
        .slice(0, 14)
        .map((commit) => ({
          date: commit.date,
          clock: formatClock(commit.hour, commit.minute),
          subject: commit.subject,
          author: commit.author,
        })),
    },
    silence: people.filter((person) => person.gapDays >= 120).sort((a, b) => b.gapDays - a.gapDays).slice(0, 8),
    people,
    you: {
      name: you.name,
      commits: you.commits,
      night: you.night,
      share: Math.round((you.commits / commits.length) * 100),
      since: you.first.date,
    },
    weekdayNames: WEEKDAYS,
  };
}

module.exports = { analyze, formatClock, weekdayOf, dated };
