let currentAnime = null;
let selectedStrongPoint = 'Содержание';
let savedRatings = JSON.parse(localStorage.getItem('anirate_saved_ratings') || '[]');
let heroList = [];
let heroIndex = 0;
let heroTimer = null;
let currentWheelRotation = 0;
let randomMediaType = 'ANIME';
let currentDrawerTab = 'ANIME';

let anilistUser = null;
let userMediaList = {};

// Укажите ваш Client ID для работы AniList OAuth
const ANILIST_CLIENT_ID = '54503';

function initCommon() {
    updateSavedCount();
    checkAuthAndInitUser();

    // Загрузка сохраненной темы
    if (localStorage.getItem('anirate_theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    window.addEventListener('click', (e) => {
        const menu = document.getElementById('overflow-menu');
        if (menu && !menu.contains(e.target) && !e.target.closest('button[onclick*="toggleOverflowMenu"]')) {
            menu.classList.add('hidden');
        }
    });

    const searchInput = document.getElementById('anime-search-input');
    if (searchInput) {
        let searchTimeout = null;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (query.length < 2) {
                const res = document.getElementById('search-results');
                if (res) res.innerHTML = '<div class="p-6 text-center text-xs text-[#9FADBD]">Начните вводить название...</div>';
                const load = document.getElementById('search-loading');
                if (load) load.classList.add('hidden');
                return;
            }

            const load = document.getElementById('search-loading');
            if (load) load.classList.remove('hidden');
            searchTimeout = setTimeout(() => { searchAllMedia(query); }, 350);
        });
    }
}

// Меню переполнения (Тема / Язык)
function toggleOverflowMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('overflow-menu');
    if (menu) menu.classList.toggle('hidden');
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('anirate_theme', isLight ? 'light' : 'dark');
}

function toggleLanguage() {
    showToast('Переключение языков (RU/EN)');
}

// Авторизация AniList (Implicit Grant)
function loginAniList() {
    const redirectUri = window.location.origin + window.location.pathname;
    window.location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
}

async function checkAuthAndInitUser() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
        localStorage.setItem('anilist_token', token);
        window.location.hash = '';
    }

    const savedToken = localStorage.getItem('anilist_token');
    if (!savedToken) return;

    try {
        const query = `
        query {
          Viewer {
            id name avatar { large }
            mediaListOptions { scoreFormat }
            statistics {
              anime { count episodesWatched meanScore }
              manga { count chaptersRead meanScore }
            }
            genres(sort: COUNT_DESC) { genre }
          }
        }
        `;
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + savedToken },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        if (data.data && data.data.Viewer) {
            anilistUser = data.data.Viewer;
            renderUserWidget(anilistUser);
            await fetchUserMediaList(anilistUser.name);
        }
    } catch (err) {
        console.error("AniList Auth Error:", err);
    }
}

async function fetchUserMediaList(username) {
    const token = localStorage.getItem('anilist_token');
    const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME) {
        lists { entries { mediaId score status } }
      }
      mangaList: MediaListCollection(userName: $userName, type: MANGA) {
        lists { entries { mediaId score status } }
      }
    }
    `;
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ query, variables: { userName: username } })
        });
        const data = await res.json();
        if (data.data) {
            userMediaList = {};
            if (data.data.MediaListCollection && data.data.MediaListCollection.lists) {
                data.data.MediaListCollection.lists.forEach(l => {
                    l.entries.forEach(e => { userMediaList[e.mediaId] = { score: e.score, status: e.status }; });
                });
            }
            if (data.data.mangaList && data.data.mangaList.lists) {
                data.data.mangaList.lists.forEach(l => {
                    l.entries.forEach(e => { userMediaList[e.mediaId] = { score: e.score, status: e.status }; });
                });
            }
        }
    } catch (err) {
        console.error("Error fetching media list:", err);
    }
}

function renderUserWidget(user) {
    const container = document.getElementById('auth-container');
    if (!container) return;
    container.innerHTML = `
        <button onclick="openProfileModal('${user.name}')" class="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#1E2C3D] border border-[#2A3A4E] hover:border-[#3DB4F2] transition">
            <img src="${user.avatar.large}" class="w-6 h-6 rounded-full object-cover">
            <span class="text-xs font-bold text-white">${user.name}</span>
        </button>
    `;
}

// Модальное окно профиля
async function openProfileModal(username) {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('hidden');
    if (username) await loadUserProfileData(username);
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('hidden');
}

async function searchUserProfile(username) {
    if (!username.trim()) return;
    await loadUserProfileData(username.trim());
}

async function loadUserProfileData(username) {
    const content = document.getElementById('profile-modal-content');
    if (!content) return;
    content.innerHTML = '<div class="text-center py-6 text-[#9FADBD]">Загрузка профиля...</div>';

    const query = `
    query ($search: String) {
      User(name: $search) {
        name about avatar { large }
        mediaListOptions { scoreFormat }
        statistics {
          anime { count episodesWatched meanScore }
          manga { count chaptersRead meanScore }
        }
        genres(sort: COUNT_DESC) { genre }
      }
    }
    `;
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: username } })
        });
        const data = await res.json();
        if (data.data && data.data.User) {
            renderUserProfile(data.data.User);
        } else {
            content.innerHTML = '<div class="text-center py-6 text-red-400">Пользователь не найден</div>';
        }
    } catch (err) {
        content.innerHTML = '<div class="text-center py-6 text-red-400">Ошибка загрузки профиля</div>';
    }
}

function renderUserProfile(user) {
    const content = document.getElementById('profile-modal-content');
    if (!content) return;
    let anirateCount = savedRatings.length;
    let anilistCount = Object.keys(userMediaList).length;

    content.innerHTML = `
        <div class="flex items-center gap-4 border-b border-[#2A3A4E] pb-4">
            <img src="${user.avatar.large}" class="w-16 h-16 rounded-2xl object-cover border border-[#3DB4F2]">
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                    <h3 class="font-rubik-black text-base text-white">${user.name}</h3>
                    <a href="https://anilist.co/user/${user.name}" target="_blank" class="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#0B1622] hover:bg-[#1E2C3D] border border-[#2A3A4E] text-[#3DB4F2] text-[10px] font-bold transition">
                        <img src="https://anilist.co/img/icons/icon.svg" class="w-3 h-3"> AniList
                    </a>
                </div>
                <p class="text-[11px] text-[#9FADBD] mt-1 line-clamp-2">${user.about ? user.about.replace(/<[^>]*>?/gm, '') : 'Нет описания'}</p>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div class="bg-[#0B1622]/60 p-3 rounded-xl border border-[#2A3A4E]">
                <h4 class="font-bold text-[#3DB4F2] mb-1">Аниме</h4>
                <p>Всего: ${user.statistics.anime.count}</p>
                <p>Эпизодов: ${user.statistics.anime.episodesWatched}</p>
            </div>
            <div class="bg-[#0B1622]/60 p-3 rounded-xl border border-[#2A3A4E]">
                <h4 class="font-bold text-[#3DB4F2] mb-1">Манга</h4>
                <p>Всего: ${user.statistics.manga.count}</p>
                <p>Глав: ${user.statistics.manga.chaptersRead}</p>
            </div>
        </div>
        <div class="bg-[#0B1622]/60 p-3 rounded-xl border border-[#2A3A4E] flex justify-around text-center">
            <div>
                <div class="font-rubik-black text-sm text-[#3DB4F2]">${anirateCount}</div>
                <div class="text-[10px] text-[#9FADBD]">В AniRate</div>
            </div>
            <div class="border-l border-[#2A3A4E]"></div>
            <div>
                <div class="font-rubik-black text-sm text-[#3DB4F2]">${anilistCount}</div>
                <div class="text-[10px] text-[#9FADBD]">В AniList</div>
            </div>
        </div>
    `;
}

// Конвертация оценки под систему AniList пользователя
function formatScoreBySystem(score90, scoreFormat) {
    const ratio = score90 / 90;
    if (!scoreFormat || scoreFormat === 'POINT_100') return Math.round(ratio * 100) + ' / 100';
    if (scoreFormat === 'POINT_10_DECIMAL') return (ratio * 10).toFixed(1) + ' / 10';
    if (scoreFormat === 'POINT_10') return Math.round(ratio * 10) + ' / 10';
    if (scoreFormat === 'POINT_5') return Math.round(ratio * 5) + ' / 5 ★';
    if (scoreFormat === 'POINT_3') {
        const val = Math.round(ratio * 2) + 1;
        return {1: '😞', 2: '😐', 3: '😊'}[val] || '😊';
    }
    return score90 + ' / 90';
}

// Рандомайзер
function setRandomMediaType(type) {
    randomMediaType = type;
    const btnAnime = document.getElementById('rand-type-anime');
    const btnManga = document.getElementById('rand-type-manga');
    if (!btnAnime || !btnManga) return;
    if (type === 'ANIME') {
        btnAnime.className = 'px-4 py-1.5 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622] transition';
        btnManga.className = 'px-4 py-1.5 rounded-lg text-xs font-bold text-[#9FADBD] hover:text-white transition';
    } else {
        btnManga.className = 'px-4 py-1.5 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622] transition';
        btnAnime.className = 'px-4 py-1.5 rounded-lg text-xs font-bold text-[#9FADBD] hover:text-white transition';
    }
}

async function executeRandomRoll(btn) {
    triggerBouncyAnimation(btn);
    const disc = document.getElementById('half-wheel-disc');
    currentWheelRotation += 1080 + Math.floor(Math.random() * 360);
    if (disc) disc.style.transform = `rotate(${currentWheelRotation}deg)`;

    const genre = document.getElementById('rand-genre').value || null;
    const format = document.getElementById('rand-format').value || null;
    const scoreMin = parseInt(document.getElementById('rand-score-min').value) || 0;
    const count = parseInt(document.getElementById('rand-count').value) || 1;

    let variables = { page: 1, perPage: 50, type: randomMediaType };
    let queryArgs = ['$page: Int', '$perPage: Int', '$type: MediaType'];
    let mediaArgs = ['type: $type', 'sort: POPULARITY_DESC'];

    if (genre) { queryArgs.push('$genre: String'); mediaArgs.push('genre:$genre'); variables.genre = genre; }
    if (format) { queryArgs.push('$format: MediaFormat'); mediaArgs.push('format:$format'); variables.format = format; }
    if (scoreMin > 0) { queryArgs.push('$scoreMin: Int'); mediaArgs.push('averageScore_greater:$scoreMin'); variables.scoreMin = scoreMin - 1; }

    const query = `query (${queryArgs.join(', ')}) { Page(page: $page, perPage: $perPage) { media(${mediaArgs.join(', ')}) { id type title { english romaji } coverImage { large } description episodes chapters seasonYear format source genres averageScore status relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } } } } }`;

    try {
        const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
        const data = await res.json();
        
        if (data.data && data.data.Page && data.data.Page.media) {
            let filtered = data.data.Page.media;
            filtered.sort(() => Math.random() - 0.5);
            setTimeout(() => { renderRandomResults(filtered.slice(0, count)); }, 1200);
        } else {
            showToast('Ничего не найдено по фильтрам');
        }
    } catch (err) { console.error(err); showToast('Ошибка рандомайзера'); }
}

function renderRandomResults(list) {
    const containerSection = document.getElementById('random-results-section');
    const grid = document.getElementById('random-results-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!list || list.length === 0) {
        showToast('Нет тайтлов с такими фильтрами');
        if (containerSection) containerSection.classList.add('hidden');
        return;
    }

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-[#3DB4F2] transition p-2.5 flex items-center gap-3 shadow-md';
        
        const seasonInfo = item.season ? `${item.season} ${item.seasonYear || ''}` : (item.seasonYear || 'Манга');
        const genresInfo = item.genres ? item.genres.slice(0, 2).join(', ') : '';
        const epsInfo = item.type === 'MANGA' ? `${item.chapters || '?'} гл.` : `${item.episodes || '?'} сер.`;
        const formatInfo = item.format || 'TV';

        card.innerHTML = `
            <img src="${item.coverImage.large}" class="w-16 h-22 object-cover rounded-lg shrink-0 shadow">
            <div class="flex-1 min-w-0 space-y-1">
                <h4 class="text-xs font-bold text-white truncate">${item.title.english || item.title.romaji}</h4>
                <p class="text-[10px] text-[#9FADBD] truncate">${genresInfo}</p>
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-1.5 py-0.5 rounded bg-[#3DB4F2]/10 text-[#3DB4F2] text-[9px] font-bold">${item.averageScore || 0}% AL</span>
                    <span class="px-1.5 py-0.5 rounded bg-[#1E2C3D] text-[#9FADBD] text-[9px] font-bold">${formatInfo}</span>
                    <span class="px-1.5 py-0.5 rounded bg-[#1E2C3D] text-[#EDF1F5] text-[9px] font-bold">${epsInfo}</span>
                </div>
                <p class="text-[9px] text-[#9FADBD]/80">${seasonInfo}</p>
                <button class="bouncy-chip mt-1 px-3 py-1 rounded-lg bg-[#3DB4F2] text-[#0B1622] font-bold text-[10px] transition">Оценить</button>
            </div>
        `;
        card.querySelector('button').onclick = () => {
            sessionStorage.setItem('selected_anime_temp', JSON.stringify(item));
            window.location.href = '../rate/';
        };
        grid.appendChild(card);
    });

    if (containerSection) {
        containerSection.classList.remove('hidden');
        containerSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Стандартные функции поиска и каталога
function openSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => {
        const input = document.getElementById('anime-search-input');
        if (input) input.focus();
    }, 50);
}

function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.add('hidden');
}

function openCoverModal() {
    if (!currentAnime || !currentAnime.coverImage) return;
    const cover = currentAnime.coverImage.extraLarge || currentAnime.coverImage.large || currentAnime.coverImage.medium;
    if (!cover) return;
    const imgModal = document.getElementById('cover-modal-img');
    const modal = document.getElementById('cover-modal');
    if (imgModal && modal) {
        imgModal.src = cover;
        modal.classList.remove('hidden');
    }
}

function closeCoverModal() {
    const modal = document.getElementById('cover-modal');
    if (modal) modal.classList.add('hidden');
}

async function searchAllMedia(queryStr) {
    const query = `
    query ($search: String) {
      anime: Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes seasonYear season format source genres averageScore status
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      manga: Page(perPage: 5) {
        media(search: $search, type: MANGA) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description chapters volumes format source genres averageScore status
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
    }
    `;
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, variables: { search: queryStr } })
        });
        const data = await res.json();
        const loading = document.getElementById('search-loading');
        if (loading) loading.classList.add('hidden');

        if (data.data) {
            renderSearchResults(data.data.anime.media, data.data.manga.media);
        }
    } catch (err) {
        console.error("AniList API Error:", err);
        const loading = document.getElementById('search-loading');
        if (loading) loading.classList.add('hidden');
    }
}

function renderSearchResults(animeList, mangaList) {
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = '';

    if ((!animeList || animeList.length === 0) && (!mangaList || mangaList.length === 0)) {
        container.innerHTML = '<div class="p-6 text-xs text-[#9FADBD] text-center">Ничего не найдено</div>';
        return;
    }

    if (animeList && animeList.length > 0) {
        const aHeader = document.createElement('h4');
        aHeader.className = 'text-xs font-bold text-[#3DB4F2] uppercase tracking-wider mb-1';
        aHeader.innerText = 'Аниме';
        container.appendChild(aHeader);
        animeList.forEach(item => container.appendChild(createSearchItemNode(item)));
    }

    if (mangaList && mangaList.length > 0) {
        const mHeader = document.createElement('h4');
        mHeader.className = 'text-xs font-bold text-[#3DB4F2] uppercase tracking-wider mt-3 mb-1';
        mHeader.innerText = 'Манга';
        container.appendChild(mHeader);
        mangaList.forEach(item => container.appendChild(createSearchItemNode(item)));
    }
}

function createSearchItemNode(media) {
    const title = media.title.english || media.title.romaji || media.title.native;
    const cover = media.coverImage.medium || media.coverImage.large;
    const sub = media.type === 'ANIME' 
        ? `${media.seasonYear || ''} ${media.format ? '• ' + media.format : ''}`
        : `${media.format || 'MANGA'} ${media.chapters ? '• ' + media.chapters + ' гл.' : ''}`;

    const item = document.createElement('div');
    item.className = 'flex items-center gap-3 p-2 rounded-xl hover:bg-[#1E2C3D] cursor-pointer transition';
    item.onclick = () => {
        closeSearchModal();
        sessionStorage.setItem('selected_anime_temp', JSON.stringify(media));
        const basePath = window.location.pathname.includes('/rate/') ? './' : (window.location.pathname.includes('/random/') ? '../rate/' : './rate/');
        window.location.href = basePath;
    };

    item.innerHTML = `
        <img src="${cover}" class="w-9 h-12 object-cover rounded shadow shrink-0">
        <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold text-white truncate">${title}</h4>
            <p class="text-[11px] text-[#9FADBD] mt-0.5">${sub}</p>
        </div>
    `;
    return item;
}

document.addEventListener("DOMContentLoaded", () => {
    const cached = sessionStorage.getItem('selected_anime_temp');
    if (cached && document.getElementById('rating-card')) {
        selectAnime(JSON.parse(cached));
    }
});

function selectAnime(anime) {
    currentAnime = anime;
    const title = anime.title.english || anime.title.romaji || anime.title.native || 'Тайтл';
    const cover = (anime.coverImage && (anime.coverImage.extraLarge || anime.coverImage.large || anime.coverImage.medium)) || 'https://placehold.co/150x200/151F2E/9FADBD?text=Нет+обложки';

    const elTitle = document.getElementById('anime-title');
    if (elTitle) elTitle.innerText = title;
    const elCover = document.getElementById('anime-cover');
    if (elCover) elCover.src = cover;
    
    const elYear = document.getElementById('anime-season-year');
    if (elYear) elYear.innerText = anime.seasonYear || (anime.type === 'MANGA' ? 'Манга' : 'N/A');
    
    const elEp = document.getElementById('anime-episodes');
    if (elEp) elEp.innerText = anime.type === 'MANGA' 
        ? (anime.chapters ? `${anime.chapters} гл.` : 'Онгоинг') 
        : (anime.episodes ? `${anime.episodes} сер.` : '?-серий');
        
    const elFormat = document.getElementById('anime-format');
    if (elFormat) elFormat.innerText = anime.format || (anime.type === 'MANGA' ? 'MANGA' : 'TV');
    
    const srcMap = { 'MANGA': 'Manga', 'LIGHT_NOVEL': 'Ranobe', 'ORIGINAL': 'Original', 'VISUAL_NOVEL': 'VN', 'NOVEL': 'Novel', 'GAME': 'Game' };
    const elSource = document.getElementById('anime-source');
    if (elSource) elSource.innerText = srcMap[anime.source] || anime.source || 'Original';

    const genresContainer = document.getElementById('anime-genres');
    if (genresContainer) {
        genresContainer.innerHTML = '';
        if (anime.genres && anime.genres.length > 0) {
            anime.genres.slice(0, 3).forEach(g => {
                const span = document.createElement('span');
                span.className = 'px-1.5 py-0.5 rounded bg-[#1E2C3D] text-[#9FADBD] text-[9px] font-semibold border border-[#2A3A4E]';
                span.innerText = g;
                genresContainer.appendChild(span);
            });
        }
    }

    renderCriteriaForMediaType(anime.type || 'ANIME');
    renderRelations(anime.relations);
}

function renderCriteriaForMediaType(type) {
    const criteriaContainer = document.getElementById('criteria-container');
    const strongChipsContainer = document.getElementById('strong-point-chips');
    if (!criteriaContainer || !strongChipsContainer) return;

    criteriaContainer.innerHTML = '';
    strongChipsContainer.innerHTML = '';

    if (type === 'MANGA') {
        const mangaCriteria = [
            { key: 'content', label: 'Содержание', icon: 'auto_stories', desc: 'Оценка сюжета, повествования и/или темпа' },
            { key: 'characters', label: 'Персонажи', icon: 'group', desc: 'Оценка проработки, развития и/или химии' },
            { key: 'visuals', label: 'Рисовка', icon: 'palette', desc: 'стиль, детализация, читаемость кадров и/или погружение' },
            { key: 'composition', label: 'Композиция', icon: 'view_kanban', desc: 'Построение страницы, ритм, работа с пространством' },
            { key: 'audio', label: 'Текст', icon: 'chat', desc: 'диалоги, нарративные вставки' },
            { key: 'aftertaste', label: 'Послевкусие', icon: 'psychology', desc: 'Насколько зацепило, эмоции и/или хочется ли вернуться?' }
        ];

        mangaCriteria.forEach(c => {
            const div = document.createElement('div');
            div.className = 'bg-[#0B1622]/50 p-2.5 rounded-xl border border-[#2A3A4E] space-y-1 hover:border-[#3DB4F2] transition group relative';
            div.title = c.desc;
            div.innerHTML = `
                <div class="flex justify-between items-center text-xs font-bold">
                    <span class="text-[#EDF1F5] flex items-center gap-1"><span class="material-symbols-outlined text-xs text-[#3DB4F2]">${c.icon}</span>${c.label}</span>
                    <span id="val-${c.key}" class="font-rubik-black text-[#3DB4F2] text-xs">8</span>
                </div>
                <input type="range" id="slider-${c.key}" min="1" max="10" value="8" step="1" class="w-full accent-[#3DB4F2] bg-[#1E2C3D] h-1.5 rounded-lg cursor-pointer" oninput="updateSliders()">
                <p class="text-[9px] text-[#9FADBD] italic">${c.desc}</p>
            `;
            criteriaContainer.appendChild(div);
        });

        const strongPoints = ['Содержание', 'Персонажи', 'Рисовка', 'Композиция', 'Текст'];
        strongPoints.forEach(sp => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.onclick = () => setStrongPoint(sp, btn);
            btn.className = 'bouncy-chip strong-chip p-1.5 rounded-lg text-xs font-bold border border-[#2A3A4E] bg-[#0B1622]/40 text-[#9FADBD] transition text-center';
            btn.setAttribute('data-key', sp);
            btn.innerText = sp;
            strongChipsContainer.appendChild(btn);
        });

    } else {
        const animeCriteria = [
            { key: 'content', label: 'Содержание', icon: 'auto_stories', desc: 'Оценка сюжета, повествования и/или темпа' },
            { key: 'characters', label: 'Персонажи', icon: 'group', desc: 'Оценка проработки, развития и/или химии' },
            { key: 'visuals', label: 'Визуал', icon: 'palette', desc: 'Оценка рисовки, анимации и/или стиля' },
            { key: 'audio', label: 'Звучок', icon: 'music_note', desc: 'Оценка музыки и OST (по желанию и озвучки)' }
        ];

        animeCriteria.forEach(c => {
            const div = document.createElement('div');
            div.className = 'bg-[#0B1622]/50 p-2.5 rounded-xl border border-[#2A3A4E] space-y-1 hover:border-[#3DB4F2] transition group relative';
            div.title = c.desc;
            div.innerHTML = `
                <div class="flex justify-between items-center text-xs font-bold">
                    <span class="text-[#EDF1F5] flex items-center gap-1"><span class="material-symbols-outlined text-xs text-[#3DB4F2]">${c.icon}</span>${c.label}</span>
                    <span id="val-${c.key}" class="font-rubik-black text-[#3DB4F2] text-xs">8</span>
                </div>
                <input type="range" id="slider-${c.key}" min="1" max="10" value="8" step="1" class="w-full accent-[#3DB4F2] bg-[#1E2C3D] h-1.5 rounded-lg cursor-pointer" oninput="updateSliders()">
                <p class="text-[9px] text-[#9FADBD] italic">${c.desc}</p>
            `;
            criteriaContainer.appendChild(div);
        });

        const afterDiv = document.createElement('div');
        afterDiv.className = 'bg-[#0B1622]/50 p-2.5 rounded-xl border border-[#2A3A4E] space-y-1 hover:border-[#3DB4F2] transition group relative sm:col-span-2';
        afterDiv.title = 'Насколько зацепило, вызвало ли эмоции и/или хочется ли вернуться?';
        afterDiv.innerHTML = `
            <div class="flex justify-between items-center text-xs font-bold">
                <span class="text-[#EDF1F5] flex items-center gap-1"><span class="material-symbols-outlined text-xs text-[#3DB4F2]">psychology</span>Послевкусие</span>
                <span id="val-aftertaste" class="font-rubik-black text-[#3DB4F2] text-xs">8</span>
            </div>
            <input type="range" id="slider-aftertaste" min="1" max="10" value="8" step="1" class="w-full accent-[#3DB4F2] bg-[#1E2C3D] h-1.5 rounded-lg cursor-pointer" oninput="updateSliders()">
            <p class="text-[9px] text-[#9FADBD] italic">Насколько зацепило, эмоции и/или хочется ли вернуться?</p>
        `;
        criteriaContainer.appendChild(afterDiv);

        const strongPoints = ['Содержание', 'Персонажи', 'Визуал', 'Звучок'];
        strongPoints.forEach(sp => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.onclick = () => setStrongPoint(sp, btn);
            btn.className = 'bouncy-chip strong-chip p-1.5 rounded-lg text-xs font-bold border border-[#2A3A4E] bg-[#0B1622]/40 text-[#9FADBD] transition text-center';
            btn.setAttribute('data-key', sp);
            btn.innerText = sp;
            strongChipsContainer.appendChild(btn);
        });
    }
    setStrongPoint('Содержание');
    updateSliders();
}

function renderRelations(relationsData) {
    const container = document.getElementById('anime-relations');
    if (!container) return;
    const hoverTitle = document.getElementById('relation-hover-title');
    container.innerHTML = '';
    if (hoverTitle) hoverTitle.classList.add('hidden');

    if (!relationsData || !relationsData.edges || relationsData.edges.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-[#9FADBD]/60 italic">Нет связанных тайтлов</span>';
        return;
    }

    relationsData.edges.forEach(edge => {
        if (!edge.node) return;
        const node = edge.node;
        const title = node.title.english || node.title.romaji;
        const cover = (node.coverImage && (node.coverImage.medium || node.coverImage.large)) || '';

        const wrapper = document.createElement('div');
        wrapper.className = 'shrink-0 cursor-pointer group relative';
        
        if (hoverTitle) {
            wrapper.onmouseenter = () => { hoverTitle.innerText = `${edge.relationType}: ${title}`; hoverTitle.classList.remove('hidden'); };
            wrapper.onmouseleave = () => { hoverTitle.classList.add('hidden'); };
        }

        wrapper.onclick = () => fetchMediaById(node.id, node.type);

        wrapper.innerHTML = `
            <div class="w-12 h-16 rounded overflow-hidden border border-[#2A3A4E] group-hover:border-[#3DB4F2] transition">
                <img src="${cover}" class="w-full h-full object-cover pointer-events-none">
            </div>
        `;
        container.appendChild(wrapper);
    });
}

async function fetchMediaById(id, type) {
    const query = `
    query ($id: Int, $type: MediaType) {
      Media(id: $id, type: $type) {
        id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes chapters volumes seasonYear season format source genres averageScore status
        relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
      }
    }
    `;
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { id, type: type || 'ANIME' } })
        });
        const data = await res.json();
        if (data.data && data.data.Media) {
            selectAnime(data.data.Media);
        }
    } catch (err) { console.error("Error fetching media by ID:", err); }
}

function setupDragScroll() {
    const slider = document.getElementById('anime-relations');
    if (!slider) return;
    let isDown = false, startX, scrollLeft;
    slider.addEventListener('mousedown', (e) => {
        isDown = true; slider.classList.add('drag-grabbing'); slider.classList.remove('drag-grab');
        startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('drag-grabbing'); slider.classList.add('drag-grab'); });
    slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('drag-grabbing'); slider.classList.add('drag-grab'); });
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return; e.preventDefault();
        slider.scrollLeft = scrollLeft - (e.pageX - slider.offsetLeft - startX) * 1.8;
    });
}

function setup3DCardTilt() {
    const container = document.getElementById('cover-container');
    if (!container) return;
    const card = document.getElementById('cover-card');
    const glare = document.getElementById('cover-glare');

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const rotateX = ((e.clientY - rect.top - rect.height/2) / (rect.height/2)) * -12;
        const rotateY = ((e.clientX - rect.left - rect.width/2) / (rect.width/2)) * 12;
        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04, 1.04, 1.04)`;
        glare.style.opacity = '1';
    });
    container.addEventListener('mouseleave', () => {
        card.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        glare.style.opacity = '0';
    });
}

function updateSliders() {
    if (!currentAnime) return;

    const c = parseInt(document.getElementById('slider-content')?.value || 8);
    const ch = parseInt(document.getElementById('slider-characters')?.value || 8);
    const v = parseInt(document.getElementById('slider-visuals')?.value || 8);
    const extra = parseInt(document.getElementById('slider-composition')?.value || document.getElementById('slider-audio')?.value || 8);
    const af = parseInt(document.getElementById('slider-aftertaste')?.value || 8);

    if (document.getElementById('val-content')) document.getElementById('val-content').innerText = c;
    if (document.getElementById('val-characters')) document.getElementById('val-characters').innerText = ch;
    if (document.getElementById('val-visuals')) document.getElementById('val-visuals').innerText = v;
    if (document.getElementById('val-composition')) document.getElementById('val-composition').innerText = extra;
    if (document.getElementById('val-audio')) document.getElementById('val-audio').innerText = extra;
    if (document.getElementById('val-aftertaste')) document.getElementById('val-aftertaste').innerText = af;

    const sum = c + ch + v + extra + af;
    const score90 = Math.round((sum / 50) * 90);
    const scoreEl = document.getElementById('score-90-value');
    if (scoreEl) scoreEl.innerText = score90;

    const convertedEl = document.getElementById('anilist-converted-score');
    if (convertedEl) {
        const scoreFormat = anilistUser && anilistUser.mediaListOptions ? anilistUser.mediaListOptions.scoreFormat : 'POINT_100';
        const formatted = formatScoreBySystem(score90, scoreFormat);
        convertedEl.innerText = `AniList: ${formatted}`;
        convertedEl.classList.remove('hidden');
    }
}

function triggerBouncyAnimation(elem) {
    if (!elem) return;
    elem.classList.remove('cartoon-squish');
    void elem.offsetWidth;
    elem.classList.add('cartoon-squish');
}

function setStrongPoint(pointName, element) {
    selectedStrongPoint = pointName;
    document.querySelectorAll('.strong-chip').forEach(btn => {
        if (btn.getAttribute('data-key') === pointName) {
            btn.classList.add('bg-[#3DB4F2]/20', 'text-[#3DB4F2]', 'border-[#3DB4F2]');
            btn.classList.remove('bg-[#0B1622]/40', 'text-[#9FADBD]', 'border-[#2A3A4E]');
        } else {
            btn.classList.remove('bg-[#3DB4F2]/20', 'text-[#3DB4F2]', 'border-[#3DB4F2]');
            btn.classList.add('bg-[#0B1622]/40', 'text-[#9FADBD]', 'border-[#2A3A4E]');
        }
    });
    if (element) triggerBouncyAnimation(element);
}

function saveCurrentRating() {
    if (!currentAnime) { showToast('Сначала выберите тайтл через поиск!'); return; }
    const c = parseInt(document.getElementById('slider-content')?.value || 8);
    const ch = parseInt(document.getElementById('slider-characters')?.value || 8);
    const v = parseInt(document.getElementById('slider-visuals')?.value || 8);
    const extra = parseInt(document.getElementById('slider-composition')?.value || document.getElementById('slider-audio')?.value || 8);
    const af = parseInt(document.getElementById('slider-aftertaste')?.value || 8);
    const sum = c + ch + v + extra + af;

    const ratingRecord = {
        id: currentAnime.id,
        type: currentAnime.type || 'ANIME',
        title: currentAnime.title.english || currentAnime.title.romaji || 'Media',
        cover: (currentAnime.coverImage && (currentAnime.coverImage.medium || currentAnime.coverImage.large)) || '',
        sliders: { content: c, characters: ch, visuals: v, extra: extra, aftertaste: af },
        strongPoint: selectedStrongPoint,
        score90: Math.round((sum / 50) * 90),
        date: new Date().toLocaleDateString()
    };

    const existingIndex = savedRatings.findIndex(r => r.id === currentAnime.id && r.type === ratingRecord.type);
    if (existingIndex >= 0) savedRatings[existingIndex] = ratingRecord;
    else savedRatings.unshift(ratingRecord);

    localStorage.setItem('anirate_saved_ratings', JSON.stringify(savedRatings));
    updateSavedCount();
    showToast('Оценка сохранена');
}

function updateSavedCount() {
    const badge = document.getElementById('saved-count-badge');
    if (badge) badge.innerText = savedRatings.length;
    const subtitle = document.getElementById('drawer-subtitle');
    if (subtitle) subtitle.innerText = `${savedRatings.length} элементов`;
}

function toggleSavedDrawer() {
    const drawer = document.getElementById('saved-drawer');
    if (!drawer) return;
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) renderSavedList();
}

function switchDrawerTab(type) {
    currentDrawerTab = type;
    const btnAnime = document.getElementById('drawer-tab-anime');
    const btnManga = document.getElementById('drawer-tab-manga');
    if (!btnAnime || !btnManga) return;
    if (type === 'ANIME') {
        btnAnime.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622]';
        btnManga.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-[#9FADBD]';
    } else {
        btnManga.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622]';
        btnAnime.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-[#9FADBD]';
    }
    renderSavedList();
}

function renderSavedList() {
    const container = document.getElementById('saved-list-container');
    if (!container) return;
    container.innerHTML = '';
    const filtered = savedRatings.filter(r => (r.type || 'ANIME') === currentDrawerTab);
    if (filtered.length === 0) { container.innerHTML = `<div class="text-center py-10 text-[#9FADBD] text-xs">Список пуст</div>`; return; }

    filtered.forEach((item) => {
        const originalIndex = savedRatings.indexOf(item);
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2.5 p-2 bg-[#0B1622]/60 rounded-xl border border-[#2A3A4E]';
        
        let scoreDisplay = `<span class="font-rubik-black text-xs text-[#3DB4F2]">${item.score90} / 90</span>`;
        if (userMediaList[item.id]) {
            const sys = anilistUser && anilistUser.mediaListOptions ? anilistUser.mediaListOptions.scoreFormat : 'POINT_100';
            scoreDisplay += ` <span class="text-[10px] text-[#9FADBD]">| AL: ${formatScoreBySystem(userMediaList[item.id].score * 10, sys)}</span>`;
        } else {
            scoreDisplay += ` <button onclick="rateOnAniList(${item.id})" class="ml-2 px-2 py-0.5 rounded bg-[#3DB4F2]/20 text-[#3DB4F2] text-[9px] font-bold">Оценить</button>`;
        }

        div.innerHTML = `
            <img src="${item.cover}" class="w-9 h-12 object-cover rounded shrink-0">
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-white truncate">${item.title}</h4>
                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    ${scoreDisplay}
                </div>
            </div>
            <button onclick="removeSavedRating(${originalIndex})" class="w-7 h-7 rounded-lg hover:bg-red-500/20 text-[#9FADBD] flex items-center justify-center">
                <span class="material-symbols-outlined text-base">delete</span>
            </button>
        `;
        container.appendChild(div);
    });
}

function rateOnAniList(mediaId) {
    window.open(`https://anilist.co/anime/${mediaId}`, '_blank');
}

function removeSavedRating(index) {
    savedRatings.splice(index, 1);
    localStorage.setItem('anirate_saved_ratings', JSON.stringify(savedRatings));
    updateSavedCount();
    renderSavedList();
    showToast('Удалено');
}

function clearAllRatings() {
    if (savedRatings.length === 0) return;
    savedRatings = [];
    localStorage.removeItem('anirate_saved_ratings');
    updateSavedCount();
    renderSavedList();
    showToast('Список очищен');
}

function exportRatingsJson() {
    if (savedRatings.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedRatings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `anirate_export_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Экспортировано');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-text').innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2200);
}

// Загрузка контента главной страницы
async function loadHomePageContent() {
    const seasonObj = getCurrentSeasonObj();
    const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      seasonAnime: Page(perPage: 50) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes seasonYear season format source genres averageScore status
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      trendingAnime: Page(perPage: 6) {
        media(type: ANIME, sort: TRENDING_DESC) { id type title { english romaji native } coverImage { large medium } seasonYear format averageScore status }
      }
      trendingManga: Page(perPage: 6) {
        media(type: MANGA, sort: POPULARITY_DESC) { id type title { english romaji native } coverImage { large medium } chapters format averageScore status }
      }
      hentaiAnime: Page(perPage: 6) {
        media(type: ANIME, genre: "Hentai", sort: POPULARITY_DESC) { id type title { english romaji native } coverImage { large medium } seasonYear format }
      }
      hentaiManga: Page(perPage: 6) {
        media(type: MANGA, genre: "Hentai", sort: POPULARITY_DESC) { id type title { english romaji native } coverImage { large medium } chapters format }
      }
    }
    `;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { season: seasonObj.season, seasonYear: seasonObj.year } })
        });
        const data = await res.json();
        if (data.data) {
            if (data.data.seasonAnime && data.data.seasonAnime.media.length > 0) {
                heroList = data.data.seasonAnime.media;
                setupHeroCarousel(seasonObj.nameRu);
            }
            if (data.data.trendingAnime) renderCardsGrid('trending-grid', data.data.trendingAnime.media, false);
            if (data.data.trendingManga) renderCardsGrid('manga-trending-grid', data.data.trendingManga.media, true);
            if (data.data.hentaiAnime) renderHentaiGrid('hentai-anime-grid', data.data.hentaiAnime.media, false);
            if (data.data.hentaiManga) renderHentaiGrid('hentai-manga-grid', data.data.hentaiManga.media, true);
        }
    } catch (err) { console.error("Home loading error:", err); }

    loadGenreAnime('Action');
    loadGenreManga('Action');
}

function getCurrentSeasonObj() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    let season = 'FALL';
    if (month === 12 || month <= 2) season = 'WINTER';
    else if (month >= 3 && month <= 5) season = 'SPRING';
    else if (month >= 6 && month <= 8) season = 'SUMMER';

    const seasonNamesRu = { 'WINTER': 'Зима', 'SPRING': 'Весна', 'SUMMER': 'Лето', 'FALL': 'Осень' };
    return { season, year, nameRu: `${seasonNamesRu[season]} ${year}` };
}

function setupHeroCarousel(seasonName) {
    if (!heroList || heroList.length === 0) return;
    heroIndex = 0;
    const slider = document.getElementById('hero-roulette-slider');
    if (slider) { slider.max = heroList.length; slider.value = 1; }
    renderHeroSlide(heroIndex, seasonName);
    restartHeroTimer();
}

function onRouletteSlide(val) {
    const idx = parseInt(val) - 1;
    if (idx >= 0 && idx < heroList.length) {
        heroIndex = idx;
        renderHeroSlide(heroIndex, getCurrentSeasonObj().nameRu);
        restartHeroTimer();
    }
}

function nextHeroSlide() {
    if (heroList.length === 0) return;
    heroIndex = (heroIndex + 1) % heroList.length;
    renderHeroSlide(heroIndex, getCurrentSeasonObj().nameRu);
    restartHeroTimer();
}

function prevHeroSlide() {
    if (heroList.length === 0) return;
    heroIndex = (heroIndex - 1 + heroList.length) % heroList.length;
    renderHeroSlide(heroIndex, getCurrentSeasonObj().nameRu);
    restartHeroTimer();
}

function renderHeroSlide(idx, seasonName) {
    const anime = heroList[idx];
    if (!anime) return;
    const bgLayer = document.getElementById('hero-bg-layer');
    if (!bgLayer) return;

    bgLayer.classList.remove('hero-slide-fade-in');
    bgLayer.classList.add('hero-slide-fade-out');

    setTimeout(() => {
        bgLayer.style.backgroundImage = `url('${anime.bannerImage || anime.coverImage.extraLarge}')`;
        document.getElementById('hero-title').innerText = anime.title.english || anime.title.romaji;
        document.getElementById('hero-season-badge').innerText = seasonName;
        document.getElementById('hero-genre').innerText = anime.genres ? anime.genres.slice(0, 2).join(' • ') : 'Аниме';
        
        const totalEp = anime.episodes || '?';
        let currentEp = totalEp;
        if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode) currentEp = anime.nextAiringEpisode.episode - 1;
        document.getElementById('hero-episodes-progress').innerText = `Вышло: ${currentEp} / ${totalEp} эп.`;
        document.getElementById('hero-desc').innerText = (anime.description || '').replace(/<[^>]*>?/gm, '');

        const rateBtn = document.getElementById('hero-rate-btn');
        if (rateBtn) {
            rateBtn.onclick = () => {
                sessionStorage.setItem('selected_anime_temp', JSON.stringify(anime));
                window.location.href = './rate/';
            };
        }
        bgLayer.classList.remove('hero-slide-fade-out');
        bgLayer.classList.add('hero-slide-fade-in');
    }, 250);

    const counter = document.getElementById('hero-roulette-counter');
    if (counter) counter.innerText = `${idx + 1} / ${heroList.length}`;
    const slider = document.getElementById('hero-roulette-slider');
    if (slider) slider.value = idx + 1;
}

function restartHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
        if (heroList.length > 0) {
            heroIndex = (heroIndex + 1) % heroList.length;
            renderHeroSlide(heroIndex, getCurrentSeasonObj().nameRu);
        }
    }, 6000);
}

function renderCardsGrid(containerId, list, isManga = false) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-[#3DB4F2] transition group cursor-pointer shadow-md flex flex-col justify-between';
        card.onclick = () => {
            sessionStorage.setItem('selected_anime_temp', JSON.stringify(item));
            const basePath = window.location.pathname.includes('/rate/') ? './' : (window.location.pathname.includes('/random/') ? '../rate/' : './rate/');
            window.location.href = basePath;
        };

        const coverWrapperClass = isManga ? 'manga-book-container relative overflow-visible py-1 px-1 my-1' : 'relative overflow-hidden aspect-[3/4]';
        const coverInnerClass = isManga ? 'manga-book-cover w-full object-cover' : 'w-full h-full object-cover group-hover:scale-105 transition duration-300';

        card.innerHTML = `
            <div class="${coverWrapperClass}">
                <img src="${item.coverImage.large || item.coverImage.medium}" class="${coverInnerClass}">
            </div>
            <div class="p-2 space-y-1 mt-1">
                <h4 class="text-xs font-bold text-white truncate group-hover:text-[#3DB4F2]">${item.title.english || item.title.romaji}</h4>
                <p class="text-[10px] text-[#9FADBD]">${isManga ? (item.chapters ? item.chapters + ' гл.' : 'Манга') : (item.seasonYear || '') + ' ' + (item.format || '')}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderHentaiGrid(containerId, list, isManga = false) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'nsfw-card bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-rose-500/80 transition group cursor-pointer shadow-md relative';
        card.onclick = () => {
            sessionStorage.setItem('selected_anime_temp', JSON.stringify(item));
            const basePath = window.location.pathname.includes('/rate/') ? './' : (window.location.pathname.includes('/random/') ? '../rate/' : './rate/');
            window.location.href = basePath;
        };

        const coverWrapperClass = isManga ? 'manga-book-container relative overflow-visible py-1 px-1 my-1' : 'relative overflow-hidden aspect-[3/4]';
        const coverInnerClass = isManga ? 'manga-book-cover w-full object-cover' : 'w-full h-full object-cover';

        card.innerHTML = `
            <div class="${coverWrapperClass}">
                <img src="${item.coverImage.large}" class="${coverInnerClass}">
                <div class="nsfw-mask absolute inset-0 bg-[#0B1622]/80 flex flex-col items-center justify-center p-2 text-center z-20 rounded-xl">
                    <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-rubik-black text-[10px]">18+</span>
                    <span class="text-[9px] text-white/90 font-bold mt-1">Наведите для просмотра</span>
                </div>
            </div>
            <div class="p-2 space-y-1 mt-1">
                <h4 class="text-xs font-bold text-white truncate group-hover:text-rose-400">${item.title.english || item.title.romaji}</h4>
                <p class="text-[10px] text-[#9FADBD]">18+</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function loadGenreAnime(genre, btnElem) {
    if (btnElem) {
        document.querySelectorAll('.genre-tab-btn').forEach(b => b.className = 'bouncy-chip genre-tab-btn px-3 py-1.5 rounded-xl bg-[#151F2E] border border-[#2A3A4E] text-[#9FADBD] text-xs font-bold shrink-0');
        btnElem.className = 'bouncy-chip genre-tab-btn px-3 py-1.5 rounded-xl bg-[#3DB4F2]/20 border border-[#3DB4F2] text-[#3DB4F2] text-xs font-bold shrink-0';
    }
    const moreBtn = document.getElementById('genre-anime-more-btn');
    if (moreBtn) moreBtn.href = `https://anilist.co/search/anime?genres=${genre}`;

    const query = `query ($genre: String) { Page(perPage: 6) { media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) { id type title { english romaji } coverImage { large } episodes seasonYear format genres relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } } } } }`;
    try {
        const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { genre } }) });
        const data = await res.json();
        if (data.data && data.data.Page) renderCardsGrid('genre-grid', data.data.Page.media, false);
    } catch (err) { console.error(err); }
}

async function loadGenreManga(genre, btnElem) {
    if (btnElem) {
        document.querySelectorAll('.manga-genre-tab-btn').forEach(b => b.className = 'bouncy-chip manga-genre-tab-btn px-3 py-1.5 rounded-xl bg-[#151F2E] border border-[#2A3A4E] text-[#9FADBD] text-xs font-bold shrink-0');
        btnElem.className = 'bouncy-chip manga-genre-tab-btn px-3 py-1.5 rounded-xl bg-[#3DB4F2]/20 border border-[#3DB4F2] text-[#3DB4F2] text-xs font-bold shrink-0';
    }
    const moreBtn = document.getElementById('genre-manga-more-btn');
    if (moreBtn) moreBtn.href = `https://anilist.co/search/manga?genres=${genre}`;

    const query = `query ($genre: String) { Page(perPage: 6) { media(type: MANGA, genre: $genre, sort: POPULARITY_DESC) { id type title { english romaji } coverImage { large } chapters format genres relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } } } } }`;
    try {
        const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { genre } }) });
        const data = await res.json();
        if (data.data && data.data.Page) renderCardsGrid('manga-genre-grid', data.data.Page.media, true);
    } catch (err) { console.error(err); }
}
