let currentAnime = null;
let selectedStrongPoint = 'Содержание';
let savedRatings = JSON.parse(localStorage.getItem('anirate_saved_ratings') || '[]');
let heroList = [];
let heroIndex = 0;
let heroTimer = null;
let currentWheelRotation = 0;
let randomMediaType = 'ANIME';
let currentDrawerTab = 'ANIME';

function initCommon() {
    updateSavedCount();
    const searchInput = document.getElementById('anime-search-input');
    if (searchInput) {
        let searchTimeout = null;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (query.length < 2) {
                document.getElementById('search-results').innerHTML = '<div class="p-6 text-center text-xs text-[#9FADBD]">Начните вводить название...</div>';
                document.getElementById('search-loading').classList.add('hidden');
                return;
            }

            document.getElementById('search-loading').classList.remove('hidden');
            searchTimeout = setTimeout(() => { searchAllMedia(query); }, 350);
        });
    }
}

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
    const input = document.getElementById('anime-search-input');
    if (input) input.value = '';
    const res = document.getElementById('search-results');
    if (res) res.innerHTML = '<div class="p-6 text-center text-xs text-[#9FADBD]">Начните вводить название...</div>';
}

function openCoverModal() {
    if (!currentAnime) return;
    const cover = currentAnime.coverImage.extraLarge || currentAnime.coverImage.large || currentAnime.coverImage.medium;
    document.getElementById('cover-modal-img').src = cover;
    document.getElementById('cover-modal').classList.remove('hidden');
}

function closeCoverModal() {
    document.getElementById('cover-modal').classList.add('hidden');
}

async function searchAllMedia(queryStr) {
    const query = `
    query ($search: String) {
      anime: Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes seasonYear season format source genres
        }
      }
      manga: Page(perPage: 5) {
        media(search: $search, type: MANGA) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description chapters volumes format source genres
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
        // Определяем правильный относительный путь до rate
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
    const title = anime.title.english || anime.title.romaji || anime.title.native;
    const cover = anime.coverImage.extraLarge || anime.coverImage.large || anime.coverImage.medium;

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
}

function setup3DCardTilt() {
    const container = document.getElementById('cover-container');
    if (!container) return;
    const card = document.getElementById('cover-card');
    const glare = document.getElementById('cover-glare');

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height/2) / (rect.height/2)) * -12;
        const rotateY = ((x - rect.width/2) / (rect.width/2)) * 12;

        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04, 1.04, 1.04)`;
        glare.style.opacity = '1';
    });

    container.addEventListener('mouseleave', () => {
        card.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        glare.style.opacity = '0';
    });
}

function getCurrentSeasonObj() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    let season = 'FALL';
    if (month === 12 || month <= 2) season = 'WINTER';
    else if (month >= 3 && month <= 5) season = 'SPRING';
    else if (month >= 6 && month <= 8) season = 'SUMMER';
    else season = 'FALL';

    const seasonNamesRu = { 'WINTER': 'Зима', 'SPRING': 'Весна', 'SUMMER': 'Лето', 'FALL': 'Осень' };
    return { season, year, nameRu: `${seasonNamesRu[season]} ${year}` };
}

async function loadHomePageContent() {
    const seasonObj = getCurrentSeasonObj();
    const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      seasonAnime: Page(perPage: 50) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes seasonYear season format source genres
        }
      }
      trendingAnime: Page(perPage: 6) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id type title { english romaji native } coverImage { large medium } seasonYear format
        }
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
        }
    } catch (err) {
        console.error("Home loading error:", err);
    }
}

function setupHeroCarousel(seasonName) {
    if (!heroList || heroList.length === 0) return;
    heroIndex = 0;
    renderHeroSlide(heroIndex, seasonName);
    restartHeroTimer();
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

function renderCardsGrid(containerId, list) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-[#3DB4F2] transition group cursor-pointer shadow-md';
        card.onclick = () => {
            sessionStorage.setItem('selected_anime_temp', JSON.stringify(item));
            const basePath = window.location.pathname.includes('/rate/') ? './' : './rate/';
            window.location.href = basePath;
        };

        card.innerHTML = `
            <div class="relative overflow-hidden aspect-[3/4]">
                <img src="${item.coverImage.large}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
            </div>
            <div class="p-2 space-y-1">
                <h4 class="text-xs font-bold text-white truncate group-hover:text-[#3DB4F2]">${item.title.english || item.title.romaji}</h4>
                <p class="text-[10px] text-[#9FADBD]">${item.seasonYear || ''} ${item.format || ''}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

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

// Выполнение рандома с новыми фильтрами
async function executeRandomRoll(btn) {
    triggerBouncyAnimation(btn);

    const disc = document.getElementById('half-wheel-disc');
    currentWheelRotation += 1080 + Math.floor(Math.random() * 360);
    if (disc) disc.style.transform = `rotate(${currentWheelRotation}deg)`;

    const yearStart = parseInt(document.getElementById('rand-year-start').value) || null;
    const yearEnd = parseInt(document.getElementById('rand-year-end').value) || null;
    const season = document.getElementById('rand-season').value || null;
    const genre = document.getElementById('rand-genre').value || null;
    const epRange = document.getElementById('rand-episodes').value;
    const format = document.getElementById('rand-format').value || null;
    const status = document.getElementById('rand-status').value || null;
    const count = parseInt(document.getElementById('rand-count').value) || 1;

    let variables = { page: 1, perPage: 50, type: randomMediaType };
    let queryArgs = ['$page: Int', '$perPage: Int', '$type: MediaType'];
    let mediaArgs = ['type: $type', 'sort: POPULARITY_DESC'];

    if (genre) { queryArgs.push('$genre: String'); mediaArgs.push('genre:$genre'); variables.genre = genre; }
    if (format) { queryArgs.push('$format: MediaFormat'); mediaArgs.push('format:$format'); variables.format = format; }
    if (status) { queryArgs.push('$status: MediaStatus'); mediaArgs.push('status:$status'); variables.status = status; }
    if (season) { queryArgs.push('$season: MediaSeason'); mediaArgs.push('season:$season'); variables.season = season; }
    if (yearStart) { queryArgs.push('$yearStart: Int'); mediaArgs.push('seasonYear_greater:$yearStart'); variables.yearStart = yearStart - 1; }
    if (yearEnd) { queryArgs.push('$yearEnd: Int'); mediaArgs.push('seasonYear_lesser:$yearEnd'); variables.yearEnd = yearEnd + 1; }

    const query = `
    query (${queryArgs.join(', ')}) {
      Page(page: $page, perPage: $perPage) {
        media(${mediaArgs.join(', ')}) {
          id type title { english romaji native } coverImage { large medium } description episodes chapters seasonYear format source genres averageScore
        }
      }
    }
    `;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const data = await res.json();
        
        if (data.data && data.data.Page && data.data.Page.media) {
            let filtered = data.data.Page.media.filter(a => {
                const eps = a.episodes || 0;
                if (epRange === '10-' && eps > 10) return false;
                if (epRange === '10+' && eps < 10) return false;
                if (epRange === '20+' && eps < 20) return false;
                if (epRange === '40+' && eps < 40) return false;
                if (epRange === '50+' && eps < 50) return false;
                if (epRange === '100+' && eps < 100) return false;
                return true;
            });

            filtered.sort(() => Math.random() - 0.5);
            const selectedList = filtered.slice(0, count);

            setTimeout(() => { renderRandomResults(selectedList); }, 1200);
        }
    } catch (err) {
        console.error("Random Roll Error:", err);
        showToast('Ошибка рандомайзера');
    }
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
        
        card.innerHTML = `
            <img src="${item.coverImage.large}" class="w-16 h-22 object-cover rounded-lg shrink-0 shadow">
            <div class="flex-1 min-w-0 space-y-1">
                <h4 class="text-xs font-bold text-white truncate">${item.title.english || item.title.romaji}</h4>
                <p class="text-[10px] text-[#9FADBD]">${item.seasonYear || ''} • ${item.episodes || '?'} сер.</p>
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

function updateSliders() {
    const cEl = document.getElementById('slider-content');
    if (!cEl) return;
    const c = parseInt(cEl.value);
    const ch = parseInt(document.getElementById('slider-characters').value);
    const v = parseInt(document.getElementById('slider-visuals').value);
    const a = parseInt(document.getElementById('slider-audio').value);
    const af = parseInt(document.getElementById('slider-aftertaste').value);

    document.getElementById('val-content').innerText = c;
    document.getElementById('val-characters').innerText = ch;
    document.getElementById('val-visuals').innerText = v;
    document.getElementById('val-audio').innerText = a;
    document.getElementById('val-aftertaste').innerText = af;

    const sum = c + ch + v + a + af;
    document.getElementById('score-90-value').innerText = Math.round((sum / 50) * 90);
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
    if (!currentAnime) {
        showToast('Сначала выберите тайтл через поиск!');
        return;
    }

    const c = parseInt(document.getElementById('slider-content').value);
    const ch = parseInt(document.getElementById('slider-characters').value);
    const v = parseInt(document.getElementById('slider-visuals').value);
    const a = parseInt(document.getElementById('slider-audio').value);
    const af = parseInt(document.getElementById('slider-aftertaste').value);
    const sum = c + ch + v + a + af;

    const ratingRecord = {
        id: currentAnime.id,
        type: currentAnime.type || 'ANIME',
        title: currentAnime.title.english || currentAnime.title.romaji || 'Media',
        cover: (currentAnime.coverImage && (currentAnime.coverImage.medium || currentAnime.coverImage.large)) || '',
        sliders: { content: c, characters: ch, visuals: v, audio: a, aftertaste: af },
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
    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-[#9FADBD] text-xs">Список пуст</div>`;
        return;
    }

    filtered.forEach((item) => {
        const originalIndex = savedRatings.indexOf(item);
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2.5 p-2 bg-[#0B1622]/60 rounded-xl border border-[#2A3A4E]';
        div.innerHTML = `
            <img src="${item.cover}" class="w-9 h-12 object-cover rounded shrink-0">
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-white truncate">${item.title}</h4>
                <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="font-rubik-black text-xs text-[#3DB4F2]">${item.score90} / 90</span>
                    <span class="text-[10px] text-[#9FADBD]">(${item.strongPoint})</span>
                </div>
            </div>
            <button onclick="removeSavedRating(${originalIndex})" class="w-7 h-7 rounded-lg hover:bg-red-500/20 text-[#9FADBD] flex items-center justify-center">
                <span class="material-symbols-outlined text-base">delete</span>
            </button>
        `;
        container.appendChild(div);
    });
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
