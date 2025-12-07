// BNAPP Calendar – LUX version
// Hebrew/Gregorian, Shabbat, Holidays, Firebase sync, city selection (worldwide), Waze, weather, dark+light

const CAL = {
  today: new Date(),
  viewYear: null,
  viewMonth: null,
  selectedDate: null,
  events: {},
  shabbatMap: {},
  holidays: {},
  hebrewDates: {},
  cityName: "יבנה, ישראל",
  cityInfo: {
    name: "יבנה, ישראל",
    lat: 31.8928,
    lon: 34.8209,
    countryCode: "IL"
  }
};

let firebaseDb = null;

// Hebrew numerals 1–30
const HEBREW_DAY_MAP = {
  1: "א׳", 2: "ב׳", 3: "ג׳", 4: "ד׳", 5: "ה׳",
  6: "ו׳", 7: "ז׳", 8: "ח׳", 9: "ט׳", 10: "י׳",
  11: "י״א", 12: "י״ב", 13: "י״ג", 14: "י״ד", 15: "ט״ו",
  16: "ט״ז", 17: "י״ז", 18: "י״ח", 19: "י״ט",
  20: "כ׳", 21: "כ״א", 22: "כ״ב", 23: "כ״ג", 24: "כ״ד",
  25: "כ״ה", 26: "כ״ו", 27: "כ״ז", 28: "כ״ח", 29: "כ״ט", 30: "ל׳"
};

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function weekdayIndexSundayFirst(d) {
  return d.getDay();
}

function cloneDate(d) {
  return new Date(d.getTime());
}

// ---------- Firebase ----------
function initFirebase() {
  if (!window.firebase || !window.firebaseConfig) {
    console.warn("Firebase SDK or config missing – sync disabled");
    return;
  }
  try {
    const app = firebase.initializeApp(window.firebaseConfig);
    firebaseDb = firebase.database(app);
    subscribeToEvents();
  } catch (e) {
    console.warn("Firebase init error", e);
  }
}

function subscribeToEvents() {
  if (!firebaseDb) return;
  const ref = firebaseDb.ref("events");
  ref.on("value", (snap) => {
    CAL.events = snap.val() || {};
    renderMonth();
  });
}

function upsertEvent(dateStr, ev) {
  if (!firebaseDb) return;
  const ref = firebaseDb.ref("events/" + dateStr);
  if (ev.id) {
    ref.child(ev.id).set(ev);
  } else {
    const newRef = ref.push();
    ev.id = newRef.key;
    newRef.set(ev);
  }
}

function getEventsForDate(dateStr) {
  const bucket = CAL.events[dateStr] || {};
  return Object.values(bucket);
}

// ---------- Routine events ----------
function getRoutineEventsForDate(dateStr) {
  const d = fromKey(dateStr);
  const dow = d.getDay(); // 0=Sunday
  const res = [];
  if (dow >= 0 && dow <= 4) {
    res.push({
      id: "routine-work",
      title: "עבודה",
      kind: "routine-work",
      owner: "both",
      start: "08:00",
      end: "17:00"
    });
    res.push({
      id: "routine-food",
      title: "אוכל ומקלחת",
      kind: "routine-food",
      owner: "both",
      start: "17:00",
      end: "18:30"
    });
  }
  return res;
}

// ---------- Hebrew dates ----------
async function fetchHebrewForMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = last.getDate();
  const tasks = {};
  const promises = [];

  for (let d = 1; d <= days; d++) {
    const gd = new Date(year, month, d);
    const key = dateKey(gd);
    const url = `https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month + 1}&gd=${d}&g2h=1&strict=1`;
    const p = fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const hd = data.hd;
        const hm = data.hm;
        const hy = data.hy;
        const label = HEBREW_DAY_MAP[hd] || String(hd);
        tasks[key] = { hd, hm, hy, label };
      })
      .catch(() => {});
    promises.push(p);
  }

  await Promise.all(promises);
  CAL.hebrewDates = { ...CAL.hebrewDates, ...tasks };
  updateMonthHeaders();
  renderMonth();
}

function updateMonthHeaders() {
  const gHeader = document.getElementById("gregorianHeader");
  const hHeader = document.getElementById("hebrewHeader");
  const todayLabel = document.getElementById("todayLabel");
  const locationLabel = document.getElementById("locationLabel");

  const y = CAL.viewYear;
  const m = CAL.viewMonth;
  const monthNames = [
    "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
    "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"
  ];
  gHeader.textContent = `${monthNames[m]} ${y}`;

  const refDate = new Date(y, m, 15);
  let hInfo = CAL.hebrewDates[dateKey(refDate)];
  if (!hInfo) {
    hInfo = CAL.hebrewDates[dateKey(new Date(y, m, 1))];
  }
  hHeader.textContent = hInfo ? `${hInfo.hm} ${hInfo.hy}` : "תאריך עברי נטען...";

  const t = CAL.today;
  todayLabel.textContent = `היום: ${t.getDate()}.${t.getMonth() + 1}.${t.getFullYear()}`;

  locationLabel.textContent = CAL.cityName || "עיר לא מוגדרת";
}

// ---------- City storage ----------
function loadCityFromStorage() {
  try {
    const infoStr = localStorage.getItem("bn_city_info");
    if (infoStr) {
      const info = JSON.parse(infoStr);
      CAL.cityInfo = info;
      CAL.cityName = info.name || "עיר";
    }
    const theme = localStorage.getItem("bn_theme");
    if (theme === "dark") {
      document.body.classList.add("dark");
      document.body.classList.remove("light");
      const toggle = document.getElementById("themeToggle");
      if (toggle) toggle.checked = true;
    }
  } catch (e) {}
}

function saveCityToStorage() {
  try {
    localStorage.setItem("bn_city_info", JSON.stringify(CAL.cityInfo));
  } catch (e) {}
}

// ---------- City search: Nominatim (OpenStreetMap) ----------
async function searchCityGlobal(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&limit=5&accept-language=he,en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BNAPP-Calendar"
    }
  });
  const data = await res.json();
  return data.map((item) => ({
    name: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    countryCode: (item.address && item.address.country_code
      ? item.address.country_code.toUpperCase()
      : "")
  }));
}

async function reloadCityDependentData() {
  updateMonthHeaders();
  await fetchHolidaysForYear(CAL.viewYear);
  await fetchShabbatForMonth(CAL.viewYear, CAL.viewMonth);
  renderMonth();
}

// ---------- Shabbat + Holidays (Hebcal using geo=pos) ----------
async function fetchShabbatForMonth(year, month) {
  const { lat, lon } = CAL.cityInfo;
  if (!lat || !lon) return;

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startStr = dateKey(first);
  const endStr = dateKey(last);

  try {
    const url = `https://www.hebcal.com/shabbat/?cfg=json&geo=pos&latitude=${lat}&longitude=${lon}&start=${startStr}&end=${endStr}`;
    const res = await fetch(url);
    const data = await res.json();
    const map = { ...CAL.shabbatMap };
    for (const item of data.items || []) {
      if (!item.category) continue;
      if (item.category === "candles") {
        const key = item.date.slice(0, 10);
        map[key] = map[key] || {};
        const m = item.title.match(/(\d{1,2}:\d{2})/);
        map[key].in = m ? m[1] : "";
      } else if (item.category === "havdalah") {
        const key = item.date.slice(0, 10);
        map[key] = map[key] || {};
        const m = item.title.match(/(\d{1,2}:\d{2})/);
        map[key].out = m ? m[1] : "";
      }
    }
    CAL.shabbatMap = map;
    renderMonth();
  } catch (e) {
    console.warn("shabbat error", e);
  }
}

async function fetchHolidaysForYear(year) {
  const { lat, lon, countryCode } = CAL.cityInfo;
  if (!lat || !lon) return;
  const isIsrael = countryCode === "IL";
  const base = `https://www.hebcal.com/hebcal/?v=1&cfg=json&maj=on&min=on&mod=on&year=${year}&geo=pos&latitude=${lat}&longitude=${lon}`;
  const url = isIsrael ? base + "&c=on" : base + "&d=1";
  try {
    const res = await fetch(url);
    const data = await res.json();
    const map = {};
    for (const item of data.items || []) {
      if (!item.title) continue;
      const key = item.date.slice(0, 10);
      map[key] = { name: item.title, hebrew: item.hebdate || "" };
    }
    CAL.holidays = map;
    renderMonth();
  } catch (e) {
    console.warn("holiday error", e);
  }
}

// ---------- Render month ----------
function renderMonth() {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;

  const y = CAL.viewYear;
  const m = CAL.viewMonth;
  grid.innerHTML = "";

  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const firstIdx = weekdayIndexSundayFirst(first);
  const daysInMonth = last.getDate();
  const prevMonthLast = new Date(y, m, 0).getDate();

  for (let i = 0; i < firstIdx; i++) {
    const dayNum = prevMonthLast - firstIdx + 1 + i;
    grid.appendChild(createDayCell(new Date(y, m - 1, dayNum), true));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    grid.appendChild(createDayCell(new Date(y, m, d), false));
  }

  const totalCells = grid.children.length;
  const cellsToAdd = totalCells <= 35 ? 42 - totalCells : (totalCells < 42 ? 42 - totalCells : 0);
  for (let i = 1; i <= cellsToAdd; i++) {
    grid.appendChild(createDayCell(new Date(y, m + 1, i), true));
  }

  updateMonthHeaders();
}

function createDayCell(d, otherMonth) {
  const key = dateKey(d);
  const cell = document.createElement("div");
  cell.className = "day-cell";
  if (otherMonth) cell.classList.add("other-month");

  const header = document.createElement("div");
  header.className = "day-header";

  const numWrap = document.createElement("div");
  numWrap.className = "day-number-wrap";

  const dayNumber = document.createElement("div");
  dayNumber.className = "day-number";
  dayNumber.textContent = d.getDate();

  const hInfo = CAL.hebrewDates[key];
  const hebrewDay = document.createElement("div");
  hebrewDay.className = "hebrew-day";
  hebrewDay.textContent = hInfo?.label || "";

  numWrap.appendChild(dayNumber);
  numWrap.appendChild(hebrewDay);
  header.appendChild(numWrap);

  const tags = document.createElement("div");
  tags.className = "day-tags";

  const weekday = d.getDay();
  const sh = CAL.shabbatMap[key];
  if (weekday === 5) {
    const tag = document.createElement("div");
    tag.className = "tag shabbat";
    tag.innerHTML = `🕯️ <span>כניסת שבת: ${sh?.in || "..."}</span>`;
    tags.appendChild(tag);
  }
  if (weekday === 6) {
    const tag = document.createElement("div");
    tag.className = "tag shabbat";
    tag.innerHTML = `✨ <span>יציאת שבת: ${sh?.out || "..."}</span>`;
    tags.appendChild(tag);
  }

  const holiday = CAL.holidays[key];
  if (holiday) {
    const tag = document.createElement("div");
    tag.className = "tag holiday";
    tag.textContent = holiday.name;
    tags.appendChild(tag);
  }

  header.appendChild(tags);
  cell.appendChild(header);

  const events = getEventsForDate(key).filter(
    (ev) => ev.kind !== "routine-work" && ev.kind !== "routine-food"
  );
  if (events.length > 2) {
    cell.classList.add("glow");
  }

  if (events.length) {
    const mini = document.createElement("div");
    mini.className = "day-events-mini";
    events.slice(0, 3).forEach((ev) => {
      const chip = document.createElement("div");
      chip.className = `event-chip ${ev.owner}`;
      chip.textContent = `• ${ev.title}`;
      mini.appendChild(chip);
    });
    if (events.length > 3) {
      const more = document.createElement("div");
      more.className = "event-chip more";
      more.textContent = `+${events.length - 3} נוספים`;
      mini.appendChild(more);
    }
    cell.appendChild(mini);
  }

  if (dateKey(CAL.today) === key) {
    const today = document.createElement("div");
    today.className = "today-pill";
    today.textContent = "היום";
    cell.appendChild(today);
  }

  cell.addEventListener("click", () => openDayModal(key));
  return cell;
}

// ---------- Day modal ----------
function openDayModal(dateStr) {
  CAL.selectedDate = dateStr;
  const d = fromKey(dateStr);
  const modal = document.getElementById("dayModal");

  const hInfo = CAL.hebrewDates[dateStr];
  const heb = document.getElementById("dayModalHebrew");
  const greg = document.getElementById("dayModalGreg");
  const meta = document.getElementById("dayModalMeta");
  const shInfo = document.getElementById("dayShabbatInfo");
  const hoursCol = document.getElementById("hoursColumn");
  const list = document.getElementById("dayEventsList");

  heb.textContent = hInfo ? `${hInfo.label} ${hInfo.hm} ${hInfo.hy}` : "";
  greg.textContent = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const weekdayNames = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  meta.textContent = weekdayNames[d.getDay()];

  const sh = CAL.shabbatMap[dateStr];
  shInfo.textContent = "";
  const weekday = d.getDay();
  if (weekday === 5 && sh?.in) shInfo.textContent = `🕯️ כניסת שבת: ${sh.in}`;
  else if (weekday === 6 && sh?.out) shInfo.textContent = `✨ יציאת שבת: ${sh.out}`;

  hoursCol.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const row = document.createElement("div");
    row.className = "hour-row";
    row.textContent = `${String(h).padStart(2, "0")}:00`;
    hoursCol.appendChild(row);
  }

  const dayEvents = [
    ...getRoutineEventsForDate(dateStr),
    ...getEventsForDate(dateStr)
  ].sort((a, b) => (a.start || "00:00").localeCompare(b.start || "00:00"));

  list.innerHTML = "";
  if (!dayEvents.length) {
    list.textContent = "אין אירועים ליום זה.";
  } else {
    for (const ev of dayEvents) {
      const row = document.createElement("div");
      row.className = `event-row ${ev.owner}`;

      const t = document.createElement("div");
      t.className = "time";
      t.textContent = ev.start ? `${ev.start}${ev.end ? " – " + ev.end : ""}` : "";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = ev.title;

      const metaEl = document.createElement("div");
      metaEl.className = "meta";
      const kindLabel =
        ev.kind === "task"
          ? "משימה"
          : ev.kind === "routine-work" || ev.kind === "routine-food"
          ? "אוטומטי"
          : "אירוע";
      let ownerLabel = "משותף";
      if (ev.owner === "benjamin") ownerLabel = "בנימין";
      if (ev.owner === "nana") ownerLabel = "ננה";
      metaEl.textContent = `${kindLabel} • ${ownerLabel}`;

      row.appendChild(t);
      row.appendChild(title);
      row.appendChild(metaEl);

      if (ev.address) {
        const addr = document.createElement("div");
        addr.className = "address";
        addr.textContent = "📍 " + ev.address;
        row.appendChild(addr);

        const actions = document.createElement("div");
        actions.className = "actions";
        const wazeBtn = document.createElement("button");
        wazeBtn.className = "waze-btn";
        wazeBtn.innerHTML = "<span>🧭</span><span>פתח ב-Waze</span>";
        wazeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const url = "https://waze.com/ul?q=" + encodeURIComponent(ev.address);
          window.open(url, "_blank");
        });
        actions.appendChild(wazeBtn);
        row.appendChild(actions);
      }

      list.appendChild(row);
    }
  }

  modal.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// ---------- Free time ----------
function computeFreeTimeForDate(dateStr) {
  const events = [...getRoutineEventsForDate(dateStr), ...getEventsForDate(dateStr)].filter(
    (ev) => ev.start && ev.end
  );

  function toMinutes(str) {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
  }
  function toStr(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const dayStart = toMinutes("07:00");
  const dayEnd = toMinutes("23:00");
  const busy = events
    .map((e) => [toMinutes(e.start), toMinutes(e.end)])
    .sort((a, b) => a[0] - b[0]);

  let cursor = dayStart;
  const free = [];
  for (const [s, e] of busy) {
    if (s > cursor) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) free.push([cursor, dayEnd]);

  return free.map(([s, e]) => `${toStr(s)} – ${toStr(e)}`);
}

// ---------- Tasks ----------
function getUpcomingTasksForMonth() {
  const res = [];
  const start = new Date(CAL.viewYear, CAL.viewMonth, 1);
  const end = new Date(CAL.viewYear, CAL.viewMonth + 1, 1);
  for (let d = cloneDate(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d);
    const events = getEventsForDate(key);
    for (const ev of events) {
      if (ev.kind === "task") {
        res.push({ dateKey: key, ev });
      }
    }
  }
  return res;
}

// ---------- Weather (Open-Meteo) ----------
async function fetchWeatherForSelectedDay() {
  const content = document.getElementById("weatherContent");
  content.textContent = "טוען מזג אוויר...";
  try {
    const { lat, lon } = CAL.cityInfo;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();

    const selKey = CAL.selectedDate || dateKey(CAL.today);
    const idx = (data.daily.time || []).indexOf(selKey);
    const i = idx >= 0 ? idx : 0;

    const tMax = data.daily.temperature_2m_max[i];
    const tMin = data.daily.temperature_2m_min[i];
    const rainProb = data.daily.precipitation_probability_max?.[i];
    const code = data.daily.weathercode?.[i];

    const descEmoji = describeWeather(code);

    content.innerHTML = `
      <p>מיקום: <strong>${CAL.cityName}</strong></p>
      <p>תאריך: <strong>${selKey}</strong></p>
      <p>${descEmoji}</p>
      <p>🌡️ מקסימום: <strong>${tMax}°C</strong></p>
      <p>🥶 מינימום: <strong>${tMin}°C</strong></p>
      ${
        typeof rainProb === "number"
          ? `<p>☔ סיכוי לגשם: <strong>${rainProb}%</strong></p>`
          : ""
      }
      <p class="hint">נתוני מזג אוויר מ-open-meteo.</p>
    `;
  } catch (e) {
    console.warn("weather error", e);
    content.textContent = "תקלה בטעינת מזג האוויר.";
  }
}

function describeWeather(code) {
  // קוד בסיסי לפי Open-Meteo / WMO
  if (code === 0) return "☀️ שמיים בהירים";
  if ([1, 2].includes(code)) return "⛅ מעונן חלקית";
  if (code === 3) return "☁️ מעונן";
  if ([45, 48].includes(code)) return "🌫 ערפל או אובך";
  if ([51, 53, 55].includes(code)) return "🌦 טפטוף";
  if ([61, 63, 65].includes(code)) return "🌧 גשם";
  if ([71, 73, 75, 77].includes(code)) return "❄️ שלג או רסיסי קרח";
  if ([80, 81, 82].includes(code)) return "🌧️ ממטרים חזקים";
  if ([95, 96, 99].includes(code)) return "⛈️ סופות רעמים";
  return "🌤 מזג אוויר מעורב";
}

// ---------- Event editor ----------
function openEventModal(dateStr = null) {
  const modal = document.getElementById("eventModal");
  const title = document.getElementById("eventModalTitle");
  const dateInput = document.getElementById("eventDate");
  const startInput = document.getElementById("eventStart");
  const endInput = document.getElementById("eventEnd");
  const addrInput = document.getElementById("eventAddress");
  const kindSelect = document.getElementById("eventKind");
  const ownerSelect = document.getElementById("eventOwner");
  const notifyCheckbox = document.getElementById("eventNotify");
  const notifyMinutes = document.getElementById("eventNotifyMinutes");
  const titleInput = document.getElementById("eventTitle");

  title.textContent = "אירוע / משימה חדשה";
  const now = new Date();
  const defaultDate = dateStr || dateKey(now);

  titleInput.value = "";
  dateInput.value = defaultDate;
  startInput.value = "20:00";
  endInput.value = "";
  addrInput.value = "";
  kindSelect.value = "event";
  ownerSelect.value = "both";
  notifyCheckbox.checked = true;
  notifyMinutes.value = "60";

  CAL.selectedDate = defaultDate;
  modal.classList.remove("hidden");
}

function handleEventFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("eventTitle").value.trim();
  const dateStr = document.getElementById("eventDate").value;
  const start = document.getElementById("eventStart").value || null;
  const end = document.getElementById("eventEnd").value || null;
  const address = document.getElementById("eventAddress").value.trim() || null;
  const kind = document.getElementById("eventKind").value;
  const owner = document.getElementById("eventOwner").value;
  const notify = document.getElementById("eventNotify").checked;
  const notifyMinutes = parseInt(
    document.getElementById("eventNotifyMinutes").value || "60",
    10
  );

  if (!title || !dateStr) return;

  const ev = {
    id: null,
    title,
    kind,
    owner,
    start,
    end,
    address,
    notify,
    notifyMinutes: Math.min(Math.max(notifyMinutes, 1), 180)
  };

  upsertEvent(dateStr, ev);
  closeModal("eventModal");
  renderMonth();

  if (notify && "Notification" in window && start) {
    if (Notification.permission === "granted") {
      scheduleLocalNotification(ev.title, dateStr, start, ev.notifyMinutes);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          scheduleLocalNotification(ev.title, dateStr, start, ev.notifyMinutes);
        }
      });
    }
  }
}

function scheduleLocalNotification(title, dateStr, start, minutesBefore) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = start.split(":").map(Number);
  const when = new Date(y, m - 1, d, hh, mm);
  const diff = when.getTime() - Date.now() - minutesBefore * 60 * 1000;
  if (diff <= 0) return;
  setTimeout(() => {
    if ("Notification" in window) {
      new Notification("תזכורת מהלוח", { body: title });
    }
  }, diff);
}

// ---------- UI ----------
function initUI() {
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    CAL.viewMonth--;
    if (CAL.viewMonth < 0) {
      CAL.viewMonth = 11;
      CAL.viewYear--;
      fetchHolidaysForYear(CAL.viewYear);
    }
    renderMonth();
    fetchShabbatForMonth(CAL.viewYear, CAL.viewMonth);
    fetchHebrewForMonth(CAL.viewYear, CAL.viewMonth);
  });

  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    CAL.viewMonth++;
    if (CAL.viewMonth > 11) {
      CAL.viewMonth = 0;
      CAL.viewYear++;
      fetchHolidaysForYear(CAL.viewYear);
    }
    renderMonth();
    fetchShabbatForMonth(CAL.viewYear, CAL.viewMonth);
    fetchHebrewForMonth(CAL.viewYear, CAL.viewMonth);
  });

  document.getElementById("todayBtn").addEventListener("click", () => {
    const t = CAL.today;
    CAL.viewYear = t.getFullYear();
    CAL.viewMonth = t.getMonth();
    renderMonth();
    fetchShabbatForMonth(CAL.viewYear, CAL.viewMonth);
    fetchHebrewForMonth(CAL.viewYear, CAL.viewMonth);
  });

  document.getElementById("freeTimeBtn").addEventListener("click", () => {
    if (!CAL.selectedDate) CAL.selectedDate = dateKey(CAL.today);
    const slots = computeFreeTimeForDate(CAL.selectedDate);
    const content = document.getElementById("freeTimeContent");
    content.innerHTML = "";
    if (!slots.length) content.textContent = "אין חלונות זמן פנויים לפי החישוב.";
    else {
      const ul = document.createElement("ul");
      slots.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }
    document.getElementById("freeTimeModal").classList.remove("hidden");
  });

  document.getElementById("tasksBtn").addEventListener("click", () => {
    const items = getUpcomingTasksForMonth();
    const content = document.getElementById("tasksContent");
    content.innerHTML = "";
    if (!items.length) content.textContent = "אין משימות בחודש הנוכחי.";
    else {
      const ul = document.createElement("ul");
      items.forEach(({ dateKey, ev }) => {
        const li = document.createElement("li");
        li.textContent = `${dateKey} – ${ev.title}`;
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }
    document.getElementById("tasksModal").classList.remove("hidden");
  });

  document.getElementById("weatherDayBtn").addEventListener("click", () => {
    document.getElementById("weatherModal").classList.remove("hidden");
    fetchWeatherForSelectedDay();
  });

  document.querySelectorAll(".modal .close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.close;
      closeModal(id);
    });
  });

  const themeToggle = document.getElementById("themeToggle");
  themeToggle.addEventListener("change", () => {
    const isDark = themeToggle.checked;
    document.body.classList.toggle("dark", isDark);
    document.body.classList.toggle("light", !isDark);
    try {
      localStorage.setItem("bn_theme", isDark ? "dark" : "light");
    } catch (e) {}
  });

  document.getElementById("eventForm").addEventListener("submit", handleEventFormSubmit);

  document.getElementById("addEventFromDayBtn").addEventListener("click", () =>
    openEventModal(CAL.selectedDate)
  );

  const cityBtn = document.getElementById("cityBtn");
  const cityModal = document.getElementById("cityModal");
  const citySearchInput = document.getElementById("citySearchInput");
  const citySearchBtn = document.getElementById("citySearchBtn");
  const cityStatus = document.getElementById("citySearchStatus");
  const cityResults = document.getElementById("cityResults");

  cityBtn.addEventListener("click", () => {
    cityStatus.textContent = "";
    cityResults.innerHTML = "";
    citySearchInput.value = "";
    cityModal.classList.remove("hidden");
    citySearchInput.focus();
  });

  citySearchBtn.addEventListener("click", async () => {
    const q = citySearchInput.value.trim();
    if (!q) return;
    cityStatus.textContent = "מחפש...";
    cityResults.innerHTML = "";
    try {
      const results = await searchCityGlobal(q);
      if (!results.length) {
        cityStatus.textContent = "לא נמצאו תוצאות.";
        return;
      }
      cityStatus.textContent = "בחר עיר מהרשימה:";
      results.forEach((info) => {
        const div = document.createElement("div");
        div.className = "city-item";
        div.innerHTML = `
          <div><strong>${info.name}</strong></div>
          <div class="hint">lat: ${info.lat}, lon: ${info.lon}</div>
        `;
        div.addEventListener("click", async () => {
          CAL.cityName = info.name;
          CAL.cityInfo = info;
          saveCityToStorage();
          cityModal.classList.add("hidden");
          await reloadCityDependentData();
        });
        cityResults.appendChild(div);
      });
    } catch (e) {
      console.warn("city search error", e);
      cityStatus.textContent = "תקלה בחיפוש העיר.";
    }
  });

  citySearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      citySearchBtn.click();
    }
  });
}

// ---------- Service worker ----------
function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
}

// ---------- Init ----------
window.addEventListener("load", () => {
  const t = CAL.today;
  CAL.viewYear = t.getFullYear();
  CAL.viewMonth = t.getMonth();

  initUI();
  loadCityFromStorage();
  initFirebase();
  renderMonth();
  fetchHolidaysForYear(CAL.viewYear);
  fetchShabbatForMonth(CAL.viewYear, CAL.viewMonth);
  fetchHebrewForMonth(CAL.viewYear, CAL.viewMonth);
  initServiceWorker();

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
});
