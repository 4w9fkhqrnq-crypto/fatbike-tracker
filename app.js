
// Supabase projectgegevens
const SUPABASE_URL = 'https://onjywbcpmwbtjhlhhvab.supabase.co';
const KEY = 'sb_publishable_6W0JF-VlCccFDop2vVUq8A_y8ax-VgN';

const $ = id => document.getElementById(id);

let db, user, rows = [], busy = false, page = 30;
let profileBusy = false;
let locationBusy = false;
let currentCity = '';

const status = message => $('status').textContent = message;

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// ====================
// PERSOONLIJKE BEGROETING
// ====================

function updateGreeting() {
    if (!user) return;

    const hour = new Date().getHours();

    let greeting;

    if (hour < 6) {
        greeting = 'Goedenacht';
    } else if (hour < 12) {
        greeting = 'Goedemorgen';
    } else if (hour < 18) {
        greeting = 'Goedemiddag';
    } else {
        greeting = 'Goedenavond';
    }

    const name = user.user_metadata?.display_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || '';

    $('greeting').textContent = name
        ? `${greeting}, ${name}! 👋`
        : `${greeting}! 👋`;
}

// Profiel openen
$('profile').onclick = () => {
    if (!user || profileBusy) return;

    $('displayName').value = user.user_metadata?.display_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || '';

    $('profilePanel').hidden = !$('profilePanel').hidden;
};

$('closeProfile').onclick = () => {
    $('profilePanel').hidden = true;
};

// Weergavenaam opslaan
$('profileForm').addEventListener('submit', async e => {
    e.preventDefault();

    if (!user || profileBusy || busy) return;

    const name = $('displayName').value.trim();

    if (!name || name.length > 40) {
        status('Vul een naam van maximaal 40 tekens in.');
        return;
    }

    profileBusy = true;
    $('saveProfile').disabled = true;

    try {
        const {data, error} = await db.auth.updateUser({
            data: {
                display_name: name
            }
        });

        if (error) throw error;

        user = data.user;

        updateGreeting();

        $('profilePanel').hidden = true;

        status('Je naam is opgeslagen!');

    } catch (e) {
        status('Naam opslaan mislukt: ' + e.message);
    } finally {
        profileBusy = false;
        $('saveProfile').disabled = false;
    }
});

// ====================
// LOCATIE EN STEDEN
// ====================

function normalizeCity(value) {
    const clean = String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 80);

    if (!clean) return '';

    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Geselecteerde stad weergeven
function updateCityDisplay() {
    $('cityInput').value = currentCity;

    $('currentCity').textContent =
        'Registreren in: ' + (currentCity || 'Onbekend');
}

// Stad per account onthouden op dit apparaat
function setCity(value) {
    if (!user) return;

    currentCity = normalizeCity(value);

    try {
        localStorage.setItem(
            'fatbike-city-' + user.id,
            currentCity
        );
    } catch (e) {
        // De stad blijft bruikbaar als lokale opslag niet beschikbaar is.
    }

    updateCityDisplay();
}

// Eerder geselecteerde stad laden
function loadCity() {
    currentCity = '';

    if (user) {
        try {
            currentCity = normalizeCity(
                localStorage.getItem('fatbike-city-' + user.id)
            );
        } catch (e) {
            currentCity = '';
        }
    }

    updateCityDisplay();

    $('locationStatus').textContent = currentCity
        ? 'Controleer of je nog in deze stad bent.'
        : 'Kies een stad of gebruik je locatie.';
}

// Handmatig stad opslaan
function saveManualCity() {
    if (!user || locationBusy) return;

    setCity($('cityInput').value);

    $('locationStatus').textContent = currentCity
        ? 'Stad ingesteld: ' + currentCity
        : 'Geen stad ingesteld.';

    render();
}

$('saveCity').onclick = saveManualCity;

$('cityInput').addEventListener('input', () => {
    render();
});

$('cityInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveManualCity();
    }
});

// Automatische stadsherkenning
$('detectCity').onclick = async () => {
    if (!user || locationBusy) return;

    if (!navigator.geolocation) {
        $('locationStatus').textContent =
            'Locatieherkenning is niet beschikbaar.';
        return;
    }

    const allowed = confirm(
        'Je huidige locatie wordt naar BigDataCloud gestuurd ' +
        'om je stadsnaam te bepalen. Deze dienst verwerkt ook ' +
        'je IP-adres. Wil je doorgaan?'
    );

    if (!allowed) return;

    const accountId = user.id;

    locationBusy = true;

    $('detectCity').disabled = true;
    $('saveCity').disabled = true;
    $('cityInput').disabled = true;

    render();

    $('locationStatus').textContent =
        'Je locatie wordt opgehaald...';

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: false,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });

        if (user?.id !== accountId) return;

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const endpoint =
            'https://api.bigdatacloud.net/data/reverse-geocode-client' +
            '?latitude=' + encodeURIComponent(latitude) +
            '&longitude=' + encodeURIComponent(longitude) +
            '&localityLanguage=nl';

        const response = await fetch(endpoint, {
            credentials: 'omit',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('Locatiedienst niet bereikbaar.');
        }

        const data = await response.json();

        if (user?.id !== accountId) return;

        const city = data.city
            || data.locality
            || '';

        if (!city) {
            throw new Error('Geen stad gevonden.');
        }

        setCity(city);

        $('locationStatus').textContent =
            'Stad gevonden: ' + currentCity +
            '. Controleer of deze klopt.';

    } catch (e) {
        $('locationStatus').textContent =
            'Locatie ophalen mislukt. Vul je stad handmatig in.';
    } finally {
        locationBusy = false;

        $('detectCity').disabled = false;
        $('saveCity').disabled = false;
        $('cityInput').disabled = false;

        render();
    }
};

// ====================
// STATISTIEKEN PER STAD
// ====================

function renderCityStats() {
    const cityCounts = new Map();

    let unknown = 0;

    for (const r of rows) {
        const city = normalizeCity(r.city);

        if (!city) {
            unknown++;
            continue;
        }

        const key = city.toLocaleLowerCase('nl-NL');

        if (!cityCounts.has(key)) {
            cityCounts.set(key, {
                name: city,
                count: 0
            });
        }

        cityCounts.get(key).count++;
    }

    const cities = [...cityCounts.values()]
        .sort((a, b) => b.count - a.count);

    $('cityCount').textContent = cities.length;

    if (unknown > 0) {
        cities.push({
            name: 'Onbekend',
            count: unknown
        });
    }

    $('cityStats').replaceChildren();

    if (!cities.length) {
        const message = document.createElement('p');

        message.textContent =
            'Nog geen fatbikes geregistreerd.';

        $('cityStats').append(message);
        return;
    }

    const max = Math.max(1, ...cities.map(c => c.count));

    for (const city of cities) {
        const item = document.createElement('div');
        item.className = 'cityItem';

        const heading = document.createElement('div');
        heading.className = 'cityHeading';

        const name = document.createElement('span');
        name.textContent = city.name;

        const count = document.createElement('strong');
        count.textContent = city.count;

        heading.append(name, count);

        const track = document.createElement('div');
        track.className = 'cityTrack';

        const bar = document.createElement('div');
        bar.className = 'cityBar';

        bar.style.width =
            `${city.count / max * 100}%`;

        track.append(bar);
        item.append(heading, track);

        $('cityStats').append(item);
    }
}

// ====================
// ALGEMENE STATISTIEKEN
// ====================

function render() {
    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    start.setDate(
        start.getDate() - (start.getDay()+6)%7
    );

    const counts = new Map();

    for (const r of rows) {
        const k = dayKey(new Date(r.created_at));
        counts.set(k, (counts.get(k)||0)+1);
    }

    $('today').textContent =
        counts.get(dayKey(now)) || 0;

    $('week').textContent =
        rows.filter(r => new Date(r.created_at) >= start).length;

    $('total').textContent = rows.length;

    $('record').textContent =
        'Dagrecord: ' +
        Math.max(0, ...counts.values()) +
        ' fatbikes';

    const days = Array.from({length:7}, (_,i) => {
        const d = new Date(now);

        d.setDate(d.getDate()-6+i);

        return {
            label: d.toLocaleDateString('nl-NL', {
                weekday:'short'
            }),
            n: counts.get(dayKey(d)) || 0
        };
    });

    const max = Math.max(1, ...days.map(d => d.n));

    $('chart').replaceChildren();

    for (const d of days) {
        const col = document.createElement('div');
        col.className = 'day';

        const n = document.createElement('span');
        n.textContent = d.n;

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${d.n/max*100}px`;

        const label = document.createElement('span');
        label.textContent = d.label;

        col.append(n, bar, label);

        $('chart').append(col);
    }

    // Historie inclusief stad
    $('entries').replaceChildren();

    for (const r of rows.slice(0,page)) {
        const li = document.createElement('li');

        const date = document.createElement('div');

        date.textContent =
            '🚲 ' +
            new Date(r.created_at).toLocaleString('nl-NL');

        const city = document.createElement('div');
        city.className = 'historyCity';

        city.textContent =
            '📍 ' + (normalizeCity(r.city) || 'Onbekend');

        li.append(date, city);

        $('entries').append(li);
    }

    if (!rows.length) {
        const li = document.createElement('li');

        li.textContent = 'Nog geen registraties.';

        $('entries').append(li);
    }

        renderCityStats();
        renderExtendedStats();
        renderAchievements();
        renderStreaks();
        renderCalendar();
        renderCityMap();

    const cityChanged =
        normalizeCity($('cityInput').value) !== currentCity;

    $('more').hidden = rows.length <= page;
    $('undo').disabled = busy || !rows.length || !user;
    $('add').disabled =
        busy || locationBusy || cityChanged || !user;
}

// ====================
// DATABASE
// ====================

async function load() {
    const accountId = user?.id;

    if (!accountId) return;

    const result = [];

    for (let offset = 0;; offset += 500) {
        const {data,error} = await db.from('sightings')
            .select('id,created_at,city')
            .eq('user_id', accountId)
            .order('created_at', {ascending:false})
            .order('id', {ascending:false})
            .range(offset,offset+499);

        if (error) throw error;

        if (user?.id !== accountId) return;

        result.push(...data);

        if (data.length < 500) break;
    }

    rows = result;

    render();
}

async function refresh() {
    try {
        await load();
        status('');
    } catch(e) {
        status('Laden mislukt: ' + e.message);
    }
}

// ====================
// NAVIGATIE
// ====================




function showTab(tab) {

    $('home').hidden = tab !== 'home';
    $('stats').hidden = tab !== 'stats';
    $('history').hidden = tab !== 'history';
    $('compare').hidden = tab !== 'compare';

    $('achievementsPanel').hidden =
        tab !== 'achievements';

    $('welcome').hidden = tab !== 'home';

    $('profilePanel').hidden = true;

    $('compareSettingsPanel').hidden = true;

    for (const button of document.querySelectorAll('[data-tab]')) {

        button.classList.toggle(
            'active',
            button.dataset.tab === tab
        );
    }

    if (tab === 'compare' && user) {

        loadComparison();
    }

    if (tab === 'achievements' && user) {

        renderAchievements();
        renderStreaks();
    }

    if (tab === 'history' && user) {

        renderCalendar();
    }

    if (tab === 'stats' &&
        user &&
        cityMapLoaded) {

        requestAnimationFrame(() => {

            renderCityMap(true);
        });
    }
}




// ====================
// DASHBOARD
// ====================

async function show() {
    resetComparison();
    resetCalendar();
    resetCityMap();

    const {data,error} = await db.auth.getUser();

    user = error ? null : data.user;

    $('login').hidden = !!user;
    $('dashboard').hidden = !user;
    $('logout').hidden = !user;
    $('profile').hidden = !user;
    $('profilePanel').hidden = true;

    rows = [];
    page = 30;

    loadCity();

    if (user) {
        showTab('home');
        updateGreeting();

        busy = true;
        render();

        await refresh();

        busy = false;
        render();
    } else {
        render();
    }
}

// ====================
// FATBIKES REGISTREREN
// ====================

async function mutate(remove) {
    if (busy || !user) return;
    if (remove && !rows.length) return;
    if (!remove && locationBusy) return;

    if (!remove &&
        normalizeCity($('cityInput').value) !== currentCity) {
        status('Sla eerst je nieuwe stad op.');
        return;
    }

    busy = true;

    render();

    try {
        const res = remove
            ? await db.from('sightings')
                .delete()
                .eq('id',rows[0].id)

            : await db.from('sightings')
                .insert({
                    user_id: user.id,
                    city: currentCity || null
                });

        if (res.error) throw res.error;

        await refresh();

    } catch(e) {
        status('Opslaan mislukt: ' + e.message);
    } finally {
        busy = false;
        render();
    }
}

// ====================
// INLOGGEN
// ====================

$('loginForm').addEventListener('submit', async e => {
    e.preventDefault();

    if (!db) return;

    const button = e.target.querySelector('button');

    button.disabled = true;

    try {
        const {error} = await db.auth.signInWithPassword({
            email: $('email').value,
            password: $('password').value
        });

        if (error) throw error;

        $('password').value = '';

        await show();

    } catch(e) {
        status('Inloggen mislukt: ' + e.message);
    } finally {
        button.disabled = false;
    }
});

// Uitloggen
$('logout').onclick = async () => {
    if (busy || profileBusy || locationBusy || comparisonNamesBusy) return;

    const {error} = await db.auth.signOut();

    if (error) {
        status(error.message);
        return;
    }

    await show();

    status('');
};

// Registratieknoppen
$('add').onclick = () => mutate(false);

$('undo').onclick = () => {
    if (rows.length &&
        confirm('Laatste registratie verwijderen?')) {
        mutate(true);
    }
};

$('more').onclick = () => {
    page += 30;
    render();
};

// Navigatieknoppen
for (const button of document.querySelectorAll('[data-tab]')) {
    button.onclick = () => showTab(button.dataset.tab);
}

// ====================
// SUPABASE VERBINDEN
// ====================

if (KEY.startsWith('JOUW') || !window.supabase) {
    status('Configureer eerst Supabase in app.js (zie README).');

    $('loginForm').querySelector('button').disabled = true;

} else {
    db = window.supabase.createClient(SUPABASE_URL, KEY);

    show().catch(e => status(e.message));

    window.addEventListener('focus', () => {
        if (user && !busy && !locationBusy) {
            refresh();
            updateGreeting();
        }
    });

    setInterval(updateGreeting, 60000);
}

// ====================
// V2.4 UITGEBREIDE STATISTIEKEN
// ====================

function renderExtendedStats() {

    const now = new Date();

    const todayKey = dayKey(now);

    const monthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
    );

    const yearStart = new Date(
        now.getFullYear(),
        0,
        1
    );

    const dailyCounts = new Map();
    const weeklyCounts = new Map();
    const monthlyCounts = new Map();
    const cityCounts = new Map();

    const weekdayTotals = Array(7).fill(0);
    const weekdayOccurrences = Array(7).fill(0);

    let earliestDate = null;

    // Registraties verwerken
    for (const row of rows) {

        const date = new Date(row.created_at);

        const dateKey = dayKey(date);

        dailyCounts.set(
            dateKey,
            (dailyCounts.get(dateKey) || 0) + 1
        );

        // Week begint op maandag
        const monday = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        monday.setDate(
            monday.getDate() - (monday.getDay() + 6) % 7
        );

        const weekKey = dayKey(monday);

        weeklyCounts.set(
            weekKey,
            (weeklyCounts.get(weekKey) || 0) + 1
        );

        const monthKey =
            `${date.getFullYear()}-${date.getMonth() + 1}`;

        monthlyCounts.set(
            monthKey,
            (monthlyCounts.get(monthKey) || 0) + 1
        );

        // Weekdag: maandag = 0
        const weekday = (date.getDay() + 6) % 7;

        weekdayTotals[weekday]++;

        // Stadsstatistieken
        const city = normalizeCity(row.city);

        if (city) {

            const key = city.toLocaleLowerCase('nl-NL');

            if (!cityCounts.has(key)) {
                cityCounts.set(key, {
                    name: city,
                    count: 0
                });
            }

            cityCounts.get(key).count++;
        }

        if (!earliestDate || date < earliestDate) {
            earliestDate = date;
        }
    }

    // Aantal kalenderdagen sinds eerste registratie
    let elapsedDays = 0;

    if (earliestDate) {

        const cursor = new Date(
            earliestDate.getFullYear(),
            earliestDate.getMonth(),
            earliestDate.getDate()
        );

        const end = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        while (cursor <= end) {

            const weekday = (cursor.getDay() + 6) % 7;

            weekdayOccurrences[weekday]++;

            elapsedDays++;

            cursor.setDate(cursor.getDate() + 1);
        }
    }

    // Algemene statistieken
    $('statsToday').textContent =
        dailyCounts.get(todayKey) || 0;

    $('month').textContent =
        rows.filter(row => {

            const date = new Date(row.created_at);

            return date >= monthStart && date <= now;

        }).length;

    $('year').textContent =
        rows.filter(row => {

            const date = new Date(row.created_at);

            return date >= yearStart && date <= now;

        }).length;

    $('statsCityCount').textContent =
        cityCounts.size;

    // Persoonlijke records
    $('dayRecord').textContent =
        Math.max(0, ...dailyCounts.values());

    $('weekRecord').textContent =
        Math.max(0, ...weeklyCounts.values());

    $('monthRecord').textContent =
        Math.max(0, ...monthlyCounts.values());

    $('activeDays').textContent =
        dailyCounts.size;

    // Gemiddelde per kalenderdag
    const average = elapsedDays
        ? rows.length / elapsedDays
        : 0;

    $('averageDay').textContent =
        average.toLocaleString('nl-NL', {
            maximumFractionDigits: 1
        });

    // Meest getelde stad
    const rankedCities = [...cityCounts.values()]
        .sort((a, b) =>
            b.count - a.count ||
            a.name.localeCompare(b.name, 'nl')
        );

    if (rankedCities.length) {

        const highestCount = rankedCities[0].count;

        const favorites = rankedCities
            .filter(city => city.count === highestCount)
            .map(city => city.name);

        $('favoriteCity').textContent =
            favorites.join(', ') +
            ' (' + highestCount + ')';

    } else {

        $('favoriteCity').textContent = 'Onbekend';
    }

    // Gemiddelden per weekdag
    const weekdays = [
        'Maandag',
        'Dinsdag',
        'Woensdag',
        'Donderdag',
        'Vrijdag',
        'Zaterdag',
        'Zondag'
    ];

    const averages = weekdayTotals.map((total, index) =>
        weekdayOccurrences[index]
            ? total / weekdayOccurrences[index]
            : 0
    );

    const maxAverage = Math.max(1, ...averages);

    $('weekdayStats').replaceChildren();

    weekdays.forEach((day, index) => {

        const item = document.createElement('div');
        item.className = 'weekdayItem';

        const heading = document.createElement('div');
        heading.className = 'cityHeading';

        const name = document.createElement('span');
        name.textContent = day;

        const value = document.createElement('strong');

        value.textContent = weekdayOccurrences[index]
            ? averages[index].toLocaleString('nl-NL', {
                maximumFractionDigits: 1
            })
            : '–';

        heading.append(name, value);

        const track = document.createElement('div');
        track.className = 'cityTrack';

        const bar = document.createElement('div');
        bar.className = 'cityBar';

        bar.style.width =
            `${averages[index] / maxAverage * 100}%`;

        track.append(bar);
        item.append(heading, track);

        $('weekdayStats').append(item);
    });
}


// ====================
// V2.5 VERGELIJKINGSPAGINA
// ====================

let comparisonData = null;
let comparisonBusy = false;
let comparisonNamesBusy = false;
let comparisonRequest = 0;

// Persoonlijke namen ophalen
function getComparisonNames() {

    const metadata = user?.user_metadata || {};

    return {
        self: metadata.compare_self_name
            || metadata.display_name
            || 'Jij',

        opponent: metadata.compare_opponent_name
            || 'Tegenstander'
    };
}

// Getallen netjes weergeven
function formatComparisonNumber(value) {

    return Number(value || 0).toLocaleString(
        'nl-NL',
        {
            maximumFractionDigits: 1
        }
    );
}

// Vergelijkingsgegevens ophalen
async function loadComparison() {

    if (!user || comparisonBusy) return;

    const accountId = user.id;
    const request = ++comparisonRequest;

    comparisonBusy = true;
    comparisonData = null;

    $('compareContent').hidden = true;
    $('refreshComparison').disabled = true;

    $('compareStatus').textContent =
        'Vergelijkingsstatistieken ophalen...';

    try {

        const {data, error} = await db.rpc(
            'get_comparison_stats'
        );

        if (request !== comparisonRequest ||
            user?.id !== accountId) return;

        if (error) throw error;

        if (!data || !data.linked) {

            $('compareStatus').textContent =
                'Er is nog geen tegenstander aan jouw account gekoppeld.';

            return;
        }

        comparisonData = data;

        renderComparison();

        $('compareContent').hidden = false;

        $('compareStatus').textContent = '';

    } catch (e) {

        if (request === comparisonRequest &&
            user?.id === accountId) {

            $('compareStatus').textContent =
                'Statistieken ophalen mislukt: ' +
                e.message;
        }

    } finally {

        if (request === comparisonRequest) {

            comparisonBusy = false;

            $('refreshComparison').disabled = false;
        }
    }
}

// Namen op de pagina weergeven
function renderComparisonNames() {

    const names = getComparisonNames();

    $('selfPlayerName').textContent =
        names.self;

    $('opponentPlayerName').textContent =
        names.opponent;

    $('selfLegend').textContent =
        names.self;

    $('opponentLegend').textContent =
        names.opponent;

    $('selfCityLegend').textContent =
        names.self;

    $('opponentCityLegend').textContent =
        names.opponent;
}

// Een vergelijkingsregel maken
function createComparisonRow(label, selfValue, opponentValue) {

    const selfNumber = Number(selfValue) || 0;
    const opponentNumber = Number(opponentValue) || 0;

    const item = document.createElement('div');
    item.className = 'comparisonItem';

    const heading = document.createElement('div');
    heading.className = 'comparisonHeading';

    const left = document.createElement('strong');
    left.className = 'selfValue';
    left.textContent =
        formatComparisonNumber(selfNumber);

    const title = document.createElement('span');
    title.className = 'comparisonLabel';
    title.textContent = label;

    const right = document.createElement('strong');
    right.className = 'opponentValue';
    right.textContent =
        formatComparisonNumber(opponentNumber);

    // Winnaar benadrukken
    if (selfNumber > opponentNumber) {

        left.classList.add('comparisonWinner');

    } else if (opponentNumber > selfNumber) {

        right.classList.add('comparisonWinner');
    }

    heading.append(left, title, right);

    // Groene en paarse balk
    const track = document.createElement('div');
    track.className = 'comparisonTrack';

    const selfBar = document.createElement('div');
    selfBar.className = 'selfBar';

    const opponentBar = document.createElement('div');
    opponentBar.className = 'opponentBar';

    const total = selfNumber + opponentNumber;

    selfBar.style.width = total
        ? `${selfNumber / total * 100}%`
        : '0%';

    opponentBar.style.width = total
        ? `${opponentNumber / total * 100}%`
        : '0%';

    track.append(selfBar, opponentBar);

    item.append(heading, track);

    return item;
}

// Vergelijkingspagina weergeven
function renderComparison() {

    if (!comparisonData?.linked) return;

    const self = comparisonData.self;
    const opponent = comparisonData.opponent;

    renderComparisonNames();

    $('selfTotal').textContent =
        formatComparisonNumber(self.total);

    $('opponentTotal').textContent =
        formatComparisonNumber(opponent.total);

    $('combinedTotal').textContent =
        formatComparisonNumber(
            Number(self.total || 0) +
            Number(opponent.total || 0)
        );

    // Alle onderlinge statistieken
    const statistics = [

        ['Vandaag', 'today'],

        ['Deze week', 'week'],

        ['Deze maand', 'month'],

        ['Dit jaar', 'year'],

        ['All-time', 'total'],

        ['Dagrecord', 'dayRecord'],

        ['Weekrecord', 'weekRecord'],

        ['Maandrecord', 'monthRecord'],

        ['Verschillende steden', 'cityCount'],

        ['Dagen geteld', 'activeDays'],

        ['Gemiddeld per dag', 'averageDay'],

        ['Langste streak', 'longestStreak']
    ];

    $('comparisonStats').replaceChildren();

    for (const [label, key] of statistics) {

        const row = createComparisonRow(
            label,
            self[key],
            opponent[key]
        );

        $('comparisonStats').append(row);
    }

    renderComparisonCities(self, opponent);
}

// Steden vergelijken
function renderComparisonCities(self, opponent) {

    const cities = new Map();

    function addCities(list, side) {

        for (const city of list || []) {

            const name = normalizeCity(city.name);

            if (!name) continue;

            const key = name.toLocaleLowerCase('nl-NL');

            if (!cities.has(key)) {

                cities.set(key, {

                    name: name,
                    self: 0,
                    opponent: 0

                });
            }

            cities.get(key)[side] +=
                Number(city.count || 0);
        }
    }

    addCities(self.cities, 'self');
    addCities(opponent.cities, 'opponent');

    const rankedCities = [...cities.values()]
        .sort((a, b) =>
            (b.self + b.opponent) -
            (a.self + a.opponent)
            || a.name.localeCompare(b.name, 'nl')
        );

    // Oude registraties zonder stadsnaam
    if (Number(self.unknownCityCount || 0) +
        Number(opponent.unknownCityCount || 0) > 0) {

        rankedCities.push({

            name: 'Onbekend',

            self: Number(
                self.unknownCityCount || 0
            ),

            opponent: Number(
                opponent.unknownCityCount || 0
            )
        });
    }

    $('comparisonCities').replaceChildren();

    if (!rankedCities.length) {

        const message = document.createElement('p');

        message.textContent =
            'Nog geen registraties beschikbaar.';

        $('comparisonCities').append(message);

        return;
    }

    for (const city of rankedCities) {

        const row = createComparisonRow(
            city.name,
            city.self,
            city.opponent
        );

        $('comparisonCities').append(row);
    }
}

// Vergelijkingsinstellingen openen
$('compareSettings').onclick = () => {

    if (!user || comparisonNamesBusy) return;

    const names = getComparisonNames();

    $('compareSelfName').value = names.self;

    $('compareOpponentName').value =
        names.opponent;

    $('compareSettingsPanel').hidden =
        !$('compareSettingsPanel').hidden;
};

// Vergelijkingsinstellingen sluiten
$('closeCompareSettings').onclick = () => {

    $('compareSettingsPanel').hidden = true;
};

// Persoonlijke vergelijkingsnamen opslaan
$('compareNamesForm').addEventListener(
    'submit',
    async e => {

        e.preventDefault();

        if (!user ||
            comparisonNamesBusy ||
            profileBusy) return;

        const accountId = user.id;

        const selfName =
            $('compareSelfName').value.trim();

        const opponentName =
            $('compareOpponentName').value.trim();

        if (selfName.length > 40 ||
            opponentName.length > 40) {

            $('compareStatus').textContent =
                'Gebruik maximaal 40 tekens per naam.';

            return;
        }

        comparisonNamesBusy = true;
        $('saveCompareNames').disabled = true;

        try {

            const {data, error} =
                await db.auth.updateUser({

                    data: {

                        compare_self_name: selfName,

                        compare_opponent_name: opponentName
                    }
                });

            if (user?.id !== accountId) return;

            if (error) throw error;

            user = data.user;

            renderComparisonNames();

            $('compareSettingsPanel').hidden = true;

            $('compareStatus').textContent =
                'Je persoonlijke namen zijn opgeslagen!';

        } catch (e) {

            $('compareStatus').textContent =
                'Namen opslaan mislukt: ' + e.message;

        } finally {

            comparisonNamesBusy = false;

            $('saveCompareNames').disabled = false;
        }
    }
);

// Vergelijkingsstatistieken handmatig vernieuwen
$('refreshComparison').onclick = () => {

    loadComparison();
};

// Statistieken vernieuwen bij terugkeer naar de website
window.addEventListener('focus', () => {

    if (user && !$('compare').hidden &&
        !comparisonBusy) {

        loadComparison();
    }
});

// Vergelijkingsgegevens wissen bij accountwisseling
function resetComparison() {

    comparisonRequest++;

    comparisonData = null;

    comparisonBusy = false;

    $('compareContent').hidden = true;

    $('compareSettingsPanel').hidden = true;

    $('compareStatus').textContent = '';

    $('comparisonStats').replaceChildren();

    $('comparisonCities').replaceChildren();

    $('compareSelfName').value = '';

    $('compareOpponentName').value = '';

    $('refreshComparison').disabled = false;
}

// ====================
// V2.6A ACHIEVEMENTS
// ====================

var achievementFilter = 'all';

// Alle beschikbare achievements
function getAchievements() {
    const streakRecord = calculateStreaks().longest;

    const dailyCounts = new Map();
    const cities = new Set();

    for (const row of rows) {

        const date = dayKey(
            new Date(row.created_at)
        );

        dailyCounts.set(
            date,
            (dailyCounts.get(date) || 0) + 1
        );

        const city = normalizeCity(row.city);

        if (city) {
            cities.add(
                city.toLocaleLowerCase('nl-NL')
            );
        }
    }

    const total = rows.length;

    const dayRecord = Math.max(
        0,
        ...dailyCounts.values()
    );

    const cityCount = cities.size;
    const activeDays = dailyCounts.size;

    return [

        // Totale registraties

        {
            icon: '🚲',
            name: 'De eerste kilometers',
            description: 'Registreer je eerste fatbike',
            goal: 1,
            value: total
        },

        {
            icon: '🎯',
            name: 'Op dreef',
            description: 'Registreer 10 fatbikes',
            goal: 10,
            value: total
        },

        {
            icon: '🥉',
            name: 'Fatbike spotter',
            description: 'Registreer 50 fatbikes',
            goal: 50,
            value: total
        },

        {
            icon: '🏆',
            name: 'Club van 100',
            description: 'Registreer 100 fatbikes',
            goal: 100,
            value: total
        },

        {
            icon: '🥈',
            name: 'Fanatieke spotter',
            description: 'Registreer 250 fatbikes',
            goal: 250,
            value: total
        },

        {
            icon: '🥇',
            name: 'Fatbike expert',
            description: 'Registreer 500 fatbikes',
            goal: 500,
            value: total
        },

        {
            icon: '👑',
            name: 'Fatbike legende',
            description: 'Registreer 1.000 fatbikes',
            goal: 1000,
            value: total
        },

        // Dagrecords

        {
            icon: '⚡',
            name: 'Drukke dag',
            description: 'Tel 10 fatbikes op één dag',
            goal: 10,
            value: dayRecord
        },

        {
            icon: '🔥',
            name: 'On fire',
            description: 'Tel 25 fatbikes op één dag',
            goal: 25,
            value: dayRecord
        },

        {
            icon: '🚀',
            name: 'Topdag',
            description: 'Tel 50 fatbikes op één dag',
            goal: 50,
            value: dayRecord
        },

        // Steden

        {
            icon: '📍',
            name: 'Ontdekkingsreiziger',
            description: 'Tel in 3 verschillende steden',
            goal: 3,
            value: cityCount
        },

        {
            icon: '🗺️',
            name: 'Stedenverzamelaar',
            description: 'Tel in 10 verschillende steden',
            goal: 10,
            value: cityCount
        },

        {
            icon: '🌍',
            name: 'Wereldreiziger',
            description: 'Tel in 25 verschillende steden',
            goal: 25,
            value: cityCount
        },

        // Actieve teldagen

        {
            icon: '📅',
            name: 'Goed bezig',
            description: 'Tel op 7 verschillende dagen',
            goal: 7,
            value: activeDays
        },

        {
            icon: '💪',
            name: 'Doorzetter',
            description: 'Tel op 30 verschillende dagen',
            goal: 30,
            value: activeDays
        },


        {
            icon: '💎',
            name: 'Echte liefhebber',
            description: 'Tel op 100 verschillende dagen',
            goal: 100,
            value: activeDays
        },

        // V2.6B - Streak achievements

        {
            icon: '🔥',
            name: 'Het begin',
            description: 'Tel 3 dagen achter elkaar',
            goal: 3,
            value: streakRecord
        },

        {
            icon: '⚡',
            name: 'Een week op dreef',
            description: 'Tel 7 dagen achter elkaar',
            goal: 7,
            value: streakRecord
        },

        {
            icon: '💪',
            name: 'Niet te stoppen',
            description: 'Tel 14 dagen achter elkaar',
            goal: 14,
            value: streakRecord
        },

        {
            icon: '🏆',
            name: 'Een maand volhouden',
            description: 'Tel 30 dagen achter elkaar',
            goal: 30,
            value: streakRecord
        },

        {
            icon: '💎',
            name: 'IJzeren discipline',
            description: 'Tel 60 dagen achter elkaar',
            goal: 60,
            value: streakRecord
        },

        {
            icon: '👑',
            name: 'Streaklegende',
            description: 'Tel 100 dagen achter elkaar',
            goal: 100,
            value: streakRecord
        }
    ];
}


// Achievements weergeven
function renderAchievements() {

    const achievements = getAchievements();

    const unlocked = achievements.filter(
        a => a.value >= a.goal
    ).length;

    const percentage =
        unlocked / achievements.length * 100;

    $('achievementCount').textContent =
        unlocked + ' / ' + achievements.length;

    $('achievementProgressBar').style.width =
        `${percentage}%`;

    const list = $('achievementList');

    list.replaceChildren();

    for (const achievement of achievements) {

        const achieved =
            achievement.value >= achievement.goal;

        if (achievementFilter === 'done' &&
            !achieved) continue;

        if (achievementFilter === 'locked' &&
            achieved) continue;

        const card = document.createElement('div');

        card.className = achieved
            ? 'achievementCard unlocked'
            : 'achievementCard locked';

        const heading = document.createElement('div');
        heading.className = 'achievementHeading';

        const icon = document.createElement('span');
        icon.className = 'achievementIcon';
        icon.textContent = achievement.icon;

        const state = document.createElement('span');
        state.textContent = achieved ? '✓' : '🔒';

        heading.append(icon, state);

        const name = document.createElement('h3');
        name.textContent = achievement.name;

        const description = document.createElement('p');
        description.textContent = achievement.description;

        const track = document.createElement('div');
        track.className = 'achievementTrack';

        const bar = document.createElement('div');
        bar.className = 'achievementBar';

        bar.style.width = `${
            Math.min(
                100,
                achievement.value / achievement.goal * 100
            )
        }%`;

        track.append(bar);

        const progress = document.createElement('span');
        progress.className = 'achievementLabel';

        progress.textContent = achieved
            ? '✓ Behaald'
            : achievement.value + ' / ' + achievement.goal;

        card.append(
            heading,
            name,
            description,
            track,
            progress
        );

        list.append(card);
    }

    if (!list.children.length) {

        const message = document.createElement('p');

        message.textContent =
            'Geen achievements in deze categorie.';

        list.append(message);
    }
}

// Filterknoppen
for (const button of document.querySelectorAll(
    '[data-achievement-filter]'
)) {

    button.onclick = () => {

        achievementFilter =
            button.dataset.achievementFilter;

        for (const b of document.querySelectorAll(
            '[data-achievement-filter]'
        )) {

            b.classList.toggle(
                'active',
                b === button
            );
        }

        renderAchievements();
    };
}

// ====================
// V2.6B STREAKS
// ====================

function calculateStreaks() {

    const activeDates = new Set();

    const now = new Date();

    const today = dayKey(now);

    // Alle unieke dagen met registraties
    for (const row of rows) {

        const date = new Date(row.created_at);

        if (date <= now) {
            activeDates.add(dayKey(date));
        }
    }

    // Huidige streak
    const cursor = new Date(now);

    const countedToday = activeDates.has(today);

    // Als vandaag nog niet geteld is,
    // blijft de streak vanaf gisteren geldig.
    if (!countedToday) {
        cursor.setDate(cursor.getDate() - 1);
    }

    let current = 0;

    while (activeDates.has(dayKey(cursor))) {

        current++;

        cursor.setDate(cursor.getDate() - 1);
    }

    // Langste streak ooit
    const sortedDates = [...activeDates].sort();

    let longest = 0;
    let sequence = 0;
    let previous = null;

    for (const dateString of sortedDates) {

        const [year, month, day] =
            dateString.split('-').map(Number);

        const date = new Date(
            year,
            month - 1,
            day
        );

        if (previous) {

            const next = new Date(previous);

            next.setDate(next.getDate() + 1);

            sequence = dayKey(next) === dateString
                ? sequence + 1
                : 1;

        } else {

            sequence = 1;
        }

        longest = Math.max(longest, sequence);

        previous = date;
    }

    return {
        current,
        longest,
        countedToday,
        activeDates
    };
}

// Streaks weergeven
function renderStreaks() {

    const streak = calculateStreaks();

    $('currentStreak').textContent =
        streak.current;

    $('longestStreak').textContent =
        streak.longest;

    // Status van vandaag
    if (streak.countedToday) {

        $('streakStatus').textContent =
            '✓ Je streak is vandaag veiliggesteld!';

    } else if (streak.current > 0) {

        $('streakStatus').textContent =
            'Tel vandaag minimaal één fatbike om je streak te behouden!';

    } else {

        $('streakStatus').textContent =
            'Registreer een fatbike om een nieuwe streak te beginnen.';
    }

    // Afgelopen zeven dagen
    const weekdays = $('streakWeek');

    weekdays.replaceChildren();

    for (let i = 6; i >= 0; i--) {

        const date = new Date();

        date.setDate(date.getDate() - i);

        const active = streak.activeDates.has(
            dayKey(date)
        );

        const item = document.createElement('div');

        item.className = 'streakDay';

        const label = document.createElement('span');

        label.textContent = date.toLocaleDateString(
            'nl-NL',
            {weekday:'short'}
        );

        const circle = document.createElement('div');

        circle.className = active
            ? 'streakCircle completed'
            : 'streakCircle';

        circle.textContent = active ? '🔥' : '−';

        if (i === 0) {
            circle.classList.add('streakToday');
        }

        circle.title = dayKey(date) +
            (active ? ': Geteld' : ': Niet geteld');

        item.append(label, circle);

        weekdays.append(item);
    }

    // Volgende streakmijlpaal
    const milestones = [
        3, 7, 14, 30, 60, 100
    ];

    const next = milestones.find(
        goal => goal > streak.longest
    );

    if (next) {

        $('streakMilestoneName').textContent =
            next + ' dagen achter elkaar';

        $('streakMilestoneCount').textContent =
            streak.longest + ' / ' + next;

        $('streakMilestoneBar').style.width =
            `${streak.longest / next * 100}%`;

        $('streakMilestoneMessage').textContent =
            'Je persoonlijke record moet nog ' +
            (next - streak.longest) +
            ' dag(en) hoger worden.';

    } else {

        $('streakMilestoneName').textContent =
            'Alle streakmijlpalen behaald!';

        $('streakMilestoneCount').textContent =
            '✓';

        $('streakMilestoneBar').style.width =
            '100%';

        $('streakMilestoneMessage').textContent =
            'Je bent een echte streaklegende!';
    }
}

// Ook vernieuwen wanneer een nieuwe dag begint
setInterval(() => {

    if (user && !busy) {

        renderStreaks();
        renderAchievements();
    }

}, 60000);

// ====================
// V2.6C KALENDER
// ====================

let calendarDate = new Date();
let calendarSelectedDay = null;

// Kalender weergeven
function renderCalendar() {

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1);

    const daysInMonth = new Date(
        year, month + 1, 0
    ).getDate();

    const offset =
        (firstDay.getDay() + 6) % 7;

    const dailyCounts = new Map();

    let monthTotal = 0;

    // Registraties van geselecteerde maand
    for (const row of rows) {

        const date = new Date(row.created_at);

        if (date.getFullYear() === year &&
            date.getMonth() === month) {

            const key = dayKey(date);

            dailyCounts.set(
                key,
                (dailyCounts.get(key) || 0) + 1
            );

            monthTotal++;
        }
    }

    // Titel van de kalender
    $('calendarMonth').textContent =
        calendarDate.toLocaleDateString(
            'nl-NL',
            {
                month: 'long',
                year: 'numeric'
            }
        );

    $('calendarTotal').textContent =
        monthTotal;

    $('calendarActiveDays').textContent =
        dailyCounts.size;

    $('calendarRecord').textContent =
        Math.max(0, ...dailyCounts.values());

    const grid = $('calendarGrid');

    grid.replaceChildren();

    // Lege vakjes voor begin van de maand
    for (let i = 0; i < offset; i++) {

        const empty = document.createElement('div');

        grid.append(empty);
    }

    const today = dayKey(new Date());

    // Kalenderdagen aanmaken
    for (let day = 1; day <= daysInMonth; day++) {

        const date = new Date(
            year, month, day
        );

        const key = dayKey(date);

        const count = dailyCounts.get(key) || 0;

        const button = document.createElement(
            'button'
        );

        button.className = 'calendarDay';
        button.type = 'button';

        // Kleurintensiteit
        if (count === 0) {

            button.classList.add('level0');

        } else if (count <= 4) {

            button.classList.add('level1');

        } else if (count <= 9) {

            button.classList.add('level2');

        } else if (count <= 19) {

            button.classList.add('level3');

        } else {

            button.classList.add('level4');
        }

        if (key === today) {

            button.classList.add(
                'calendarCurrentDay'
            );
        }

        if (key === calendarSelectedDay) {

            button.classList.add(
                'calendarSelected'
            );
        }

        button.setAttribute(
            'aria-pressed',
            String(key === calendarSelectedDay)
        );

        button.setAttribute(
            'aria-label',
            key + ': ' + count + ' fatbikes'
        );

        const number = document.createElement(
            'span'
        );

        number.className = 'calendarDayNumber';
        number.textContent = day;

        const amount = document.createElement(
            'strong'
        );

        amount.className = 'calendarDayCount';

        amount.textContent = count || '–';

        button.append(number, amount);

        button.onclick = () => {

            calendarSelectedDay = key;

            renderCalendar();
        };

        grid.append(button);
    }

    renderCalendarDetails();
}

// Details van geselecteerde dag
function renderCalendarDetails() {

    if (!calendarSelectedDay) {

        $('calendarDetails').hidden = true;

        $('calendarSelectedEntries')
            .replaceChildren();

        return;
    }

    const [year, month, day] =
        calendarSelectedDay.split('-').map(Number);

    const date = new Date(
        year,
        month - 1,
        day
    );

    const entries = rows.filter(row =>

        dayKey(new Date(row.created_at))
            === calendarSelectedDay
    );

    $('calendarSelectedDate').textContent =
        date.toLocaleDateString(
            'nl-NL',
            {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }
        );

    $('calendarSelectedCount').textContent =
        entries.length + ' fatbikes';

    const list = $('calendarSelectedEntries');

    list.replaceChildren();

    if (!entries.length) {

        const message = document.createElement('p');

        message.textContent =
            'Op deze dag zijn geen fatbikes geregistreerd.';

        list.append(message);
    }

    for (const entry of entries) {

        const item = document.createElement('div');

        item.className = 'calendarEntry';

        const time = document.createElement('span');

        time.textContent =
            '🚲 ' +
            new Date(entry.created_at)
                .toLocaleTimeString(
                    'nl-NL',
                    {
                        hour: '2-digit',
                        minute: '2-digit'
                    }
                );

        const city = document.createElement('span');

        city.textContent =
            '📍 ' +
            (normalizeCity(entry.city) || 'Onbekend');

        item.append(time, city);

        list.append(item);
    }

    $('calendarDetails').hidden = false;
}

// Wisselen tussen maanden
function changeCalendarMonth(amount) {

    calendarDate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + amount,
        1
    );

    calendarSelectedDay = null;

    renderCalendar();
}

$('calendarPrevious').onclick = () => {

    changeCalendarMonth(-1);
};

$('calendarNext').onclick = () => {

    changeCalendarMonth(1);
};

// Terug naar huidige maand
$('calendarToday').onclick = () => {

    calendarDate = new Date();

    calendarSelectedDay = null;

    renderCalendar();
};

// Kalender resetten bij accountwisseling
function resetCalendar() {

    calendarDate = new Date();

    calendarSelectedDay = null;

    $('calendarGrid').replaceChildren();

    $('calendarSelectedEntries').replaceChildren();

    $('calendarDetails').hidden = true;
}

// ====================
// V2.6D STEDENKAART
// ====================

let cityMap = null;
let cityMapLayer = null;
let cityMapLoaded = false;
let cityMapRequest = 0;
let cityMapBounds = null;
let cityMapTileError = false;

const cityCoordinateCache = new Map();

// Aantal registraties per stad verzamelen
function getMapCities() {

    const cities = new Map();

    for (const row of rows) {

        const city = normalizeCity(row.city);

        if (!city) continue;

        const key = city.toLocaleLowerCase('nl-NL');

        if (key === 'onbekend') continue;

        if (!cities.has(key)) {

            cities.set(key, {
                name: city,
                count: 0
            });
        }

        cities.get(key).count++;
    }

    return [...cities.values()]
        .sort((a, b) => b.count - a.count);
}

// Algemene stadscoördinaten ophalen
async function getCityCoordinates(city) {

    const key = city.toLocaleLowerCase('nl-NL');

        // Gecorrigeerde stadscentra
    const cityOverrides = {
        'lelystad': [52.5080182, 5.4728518]
    };

    if (Object.hasOwn(cityOverrides, key)) {
        return cityOverrides[key];
    }

    if (cityCoordinateCache.has(key)) {

        return cityCoordinateCache.get(key);
    }

    const params = new URLSearchParams({

        q: city,

        fq: 'type:woonplaats',

        fl: 'woonplaatsnaam,centroide_ll',

        rows: '20'
    });

    const url =
        'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?'
        + params.toString();

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        10000
    );

    try {

        const response = await fetch(url, {
            signal: controller.signal,
            credentials: 'omit'
        });

        if (!response.ok) {

            throw new Error(
                'Locatiedienst niet bereikbaar'
            );
        }

        const data = await response.json();

        const results =
            data.response?.docs || [];

        // Alleen overeenkomende stadsnamen gebruiken
        const matches = results.filter(item =>

            normalizeCity(item.woonplaatsnaam)
                .toLocaleLowerCase('nl-NL') === key
        );

        // Geen willekeurige plaats kiezen bij twijfel
        if (matches.length !== 1) {

            return null;
        }

        const point =
            matches[0].centroide_ll || '';

        const match = point.match(
            /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i
        );

        if (!match) return null;

        const longitude = Number(match[1]);
        const latitude = Number(match[2]);

        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180) {

            return null;
        }

        const coordinates = [
            latitude,
            longitude
        ];

        cityCoordinateCache.set(
            key,
            coordinates
        );

        return coordinates;

    } finally {

        clearTimeout(timeout);
    }
}

// Kaart aanmaken
function initializeCityMap() {

    if (cityMap) return true;

    if (!window.L) {

        $('cityMapStatus').textContent =
            'De kaartbibliotheek kon niet worden geladen.';

        return false;
    }

    $('cityMap').hidden = false;

    cityMap = L.map('cityMap', {

        scrollWheelZoom: false,

        minZoom: 3,

        maxZoom: 18

    }).setView([52.15, 5.35], 7);

    const tiles = L.tileLayer(

        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

        {
            maxZoom: 19,

            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
    );

    tiles.on('tileerror', () => {

        cityMapTileError = true;

        $('cityMapStatus').textContent =
            'Een deel van de kaart kon niet worden geladen.';
    });

    tiles.addTo(cityMap);

    cityMapLayer = L.layerGroup()
        .addTo(cityMap);

    cityMap.invalidateSize();

    return true;
}

// Veilige pop-up voor iedere stad
function createCityPopup(city) {

    const popup = document.createElement('div');

    popup.className = 'mapPopup';

    const title = document.createElement('strong');

    title.textContent = city.name;

    const amount = document.createElement('p');

    amount.textContent =
        city.count +
        (city.count === 1
            ? ' fatbike gespot'
            : ' fatbikes gespot');

    popup.append(title, amount);

    return popup;
}

// Alle steden op de kaart tonen
function fitCityMap() {

    if (!cityMap) return;

    cityMap.invalidateSize();

    if (cityMapBounds?.isValid()) {

        cityMap.fitBounds(
            cityMapBounds,
            {
                padding: [35, 35],
                maxZoom: 12
            }
        );

    } else {

        cityMap.setView([52.15, 5.35], 7);
    }
}

// Stedenkaart bijwerken
async function renderCityMap(fit = false) {

    if (!user ||
        !cityMapLoaded ||
        $('stats').hidden) return;

    const accountId = user.id;
    const request = ++cityMapRequest;

    if (!initializeCityMap()) return;

    const cities = getMapCities();

    cityMapLayer.clearLayers();

    cityMapBounds = null;

    $('mappedCities').textContent = '0';
    $('mappedFatbikes').textContent = '0';

    $('cityMapStatus').textContent =
        'Steden op de kaart plaatsen...';

    const points = [];
    const missing = [];

    let mappedCities = 0;
    let mappedFatbikes = 0;

    for (const city of cities) {

        if (request !== cityMapRequest ||
            user?.id !== accountId) return;

        let coordinates;

        try {

            coordinates =
                await getCityCoordinates(city.name);

        } catch (e) {

            coordinates = null;
        }

        // Stop bij accountwisseling of nieuwe aanvraag
        if (request !== cityMapRequest ||
            user?.id !== accountId) return;

        if (!coordinates) {

            missing.push(city.name);

            continue;
        }

        // Markering met het aantal fatbikes
        const markerContent =
            document.createElement('span');

        markerContent.textContent = city.count;

        const markerIcon = L.divIcon({

            className: 'fatbikeMapMarker',

            html: markerContent,

            iconSize: [42, 42],

            iconAnchor: [21, 21]

        });

        const marker = L.marker(

            coordinates,

            {
                icon: markerIcon,

                title: city.name,

                alt: city.name
            }
        );

        marker.bindPopup(
            createCityPopup(city)
        );

        marker.addTo(cityMapLayer);

        points.push(coordinates);

        mappedCities++;
        mappedFatbikes += city.count;
    }

    if (request !== cityMapRequest ||
        user?.id !== accountId) return;

    cityMapBounds = L.latLngBounds(points);

    $('mappedCities').textContent =
        mappedCities;

    $('mappedFatbikes').textContent =
        mappedFatbikes;

    $('resetMapView').hidden =
        !mappedCities;

    if (!cities.length) {

        $('cityMapStatus').textContent =
            'Registreer eerst een fatbike in een bekende stad.';

    } else if (missing.length) {

        $('cityMapStatus').textContent =
            'Niet gevonden op de kaart: ' +
            missing.join(', ') +
            '. Deze registraties blijven wel meetellen.';

    } else if (cityMapTileError) {

        $('cityMapStatus').textContent =
            'Een deel van de kaart kon niet worden geladen.';

    } else {

        $('cityMapStatus').textContent =
            'Klik op een markering om de stadsstatistieken te bekijken.';
    }

    if (!$('stats').hidden) {

        cityMap.invalidateSize();

        if (fit) fitCityMap();
    }
}

// Kaart openen na toestemming
$('loadCityMap').onclick = () => {

    if (!user) return;

    const allowed = confirm(

        'Om de kaart te tonen worden je geregistreerde ' +
        'stadsnamen opgezocht via PDOK. OpenStreetMap ' +
        'levert de achtergrondkaart. Deze diensten ' +
        'ontvangen ook je IP-adres. Doorgaan?'
    );

    if (!allowed) return;

    cityMapLoaded = true;

    $('loadCityMap').hidden = true;

    renderCityMap(true);
};

// Alle markeringen opnieuw in beeld brengen
$('resetMapView').onclick = () => {

    fitCityMap();
};

// Kaart resetten bij accountwisseling
function resetCityMap() {

    cityMapRequest++;

    cityMapLoaded = false;

    cityMapBounds = null;

    cityMapTileError = false;

    if (cityMap) {

        cityMap.remove();

        cityMap = null;

        cityMapLayer = null;
    }

    cityCoordinateCache.clear();

    $('cityMap').hidden = true;

    $('loadCityMap').hidden = false;

    $('resetMapView').hidden = true;

    $('mappedCities').textContent = '0';

    $('mappedFatbikes').textContent = '0';

    $('cityMapStatus').textContent = '';
}
