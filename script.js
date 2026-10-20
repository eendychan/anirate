let currentAnime = null;
let selectedStrongPoint = 'Содержание';
let savedRatings = JSON.parse(localStorage.getItem('anirate_saved_ratings') || '[]');
let heroList = [];
let heroIndex = 0;
let heroTimer = null;
let currentWheelRotation = 0;
let randomMediaType = 'ANIME';
let currentDrawerTab = 'ANIME';

window.onload = function() {
    updateSavedCount();
    setStrongPoint('Содержание');
    setupDragScroll();
    setup3DCardTilt();
    loadHomePageContent();

    const searchInput = document.getElementById('anime-search-input');
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
        searchTimeout = setTimeout(() => {
            searchAllMedia(query);
        }, 350);
    });

    updateSliders();
};

function openSearchModal() {
    const modal = document.getElementById('search-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('anime-search-input').focus();
    }, 50);
}

function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    modal.classList.add('hidden');
    document.getElementById('anime-search-input').value = '';
    document.getElementById('search-results').innerHTML = '<div class="p-6 text-center text-xs text-[#9FADBD]">Начните вводить название...</div>';
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
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      manga: Page(perPage: 5) {
        media(search: $search, type: MANGA) {
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description chapters volumes format source genres
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
        document.getElementById('search-loading').classList.add('hidden');

        if (data.data) {
            renderSearchResults(data.data.anime.media, data.data.manga.media);
        }
    } catch (err) {
        console.error("AniList API Error:", err);
        document.getElementById('search-loading').classList.add('hidden');
    }
}

function renderSearchResults(animeList, mangaList) {
    const container = document.getElementById('search-results');
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
        selectAnime(media);
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

function selectAnime(anime) {
    currentAnime = anime;
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('random-view').classList.add('hidden');
    document.getElementById('rating-card').classList.remove('hidden');

    const title = anime.title.english || anime.title.romaji || anime.title.native;
    const cover = anime.coverImage.extraLarge || anime.coverImage.large || anime.coverImage.medium;

    document.getElementById('anime-title').innerText = title;
    document.getElementById('anime-cover').src = cover;
    document.getElementById('anime-season-year').innerText = anime.seasonYear || (anime.type === 'MANGA' ? 'Манга' : 'N/A');
    document.getElementById('anime-episodes').innerText = anime.type === 'MANGA' 
        ? (anime.chapters ? `${anime.chapters} гл.` : 'Онгоинг') 
        : (anime.episodes ? `${anime.episodes} сер.` : '?-серий');
    document.getElementById('anime-format').innerText = anime.format || (anime.type === 'MANGA' ? 'MANGA' : 'TV');
    
    const srcMap = {
        'MANGA': 'Manga',
        'LIGHT_NOVEL': 'Ranobe',
        'ORIGINAL': 'Original',
        'VISUAL_NOVEL': 'VN',
        'NOVEL': 'Novel',
        'GAME': 'Game'
    };
    document.getElementById('anime-source').innerText = srcMap[anime.source] || anime.source || 'Original';

    const genresContainer = document.getElementById('anime-genres');
    genresContainer.innerHTML = '';
    if (anime.genres && anime.genres.length > 0) {
        anime.genres.slice(0, 3).forEach(g => {
            const span = document.createElement('span');
            span.className = 'px-1.5 py-0.5 rounded bg-[#1E2C3D] text-[#9FADBD] text-[9px] font-semibold border border-[#2A3A4E]';
            span.innerText = g;
            genresContainer.appendChild(span);
        });
    }

    renderRelations(anime.relations);

    document.getElementById('slider-content').value = 8;
    document.getElementById('slider-characters').value = 8;
    document.getElementById('slider-visuals').value = 8;
    document.getElementById('slider-audio').value = 8;
    document.getElementById('slider-aftertaste').value = 8;
    updateSliders();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderRelations(relationsData) {
    const container = document.getElementById('anime-relations');
    const hoverTitle = document.getElementById('relation-hover-title');
    container.innerHTML = '';
    hoverTitle.classList.add('hidden');

    if (!relationsData || !relationsData.edges || relationsData.edges.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-[#9FADBD]/60 italic">Нет связанных тайтлов</span>';
        return;
    }

    relationsData.edges.forEach(edge => {
        if (!edge.node) return;
        const node = edge.node;
        const title = node.title.english || node.title.romaji;
        const cover = node.coverImage.medium || node.coverImage.large;

        const wrapper = document.createElement('div');
        wrapper.className = 'shrink-0 cursor-pointer group relative';
        
        wrapper.onmouseenter = () => {
            hoverTitle.innerText = title;
            hoverTitle.classList.remove('hidden');
        };
        wrapper.onmouseleave = () => {
            hoverTitle.classList.add('hidden');
        };

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
        id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes chapters volumes seasonYear season format source genres
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
    } catch (err) {
        console.error("Error fetching media by ID:", err);
    }
}

function setupDragScroll() {
    const slider = document.getElementById('anime-relations');
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('drag-grabbing');
        slider.classList.remove('drag-grab');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.classList.remove('drag-grabbing');
        slider.classList.add('drag-grab');
    });

    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.classList.remove('drag-grabbing');
        slider.classList.add('drag-grab');
    });

    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 1.8;
        slider.scrollLeft = scrollLeft - walk;
    });
}

function setup3DCardTilt() {
    const container = document.getElementById('cover-container');
    const card = document.getElementById('cover-card');
    const glare = document.getElementById('cover-glare');

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;

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
          id type title { english romaji native } coverImage { extraLarge large medium } bannerImage description episodes seasonYear season format source genres nextAiringEpisode { episode airingAt } startDate { year month day }
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      trendingAnime: Page(perPage: 6) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id type title { english romaji native } coverImage { large medium } seasonYear format
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      trendingManga: Page(perPage: 6) {
        media(type: MANGA, sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { large medium } chapters format
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      hentaiAnime: Page(perPage: 6) {
        media(type: ANIME, genre: "Hentai", sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { large medium } seasonYear format
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
      hentaiManga: Page(perPage: 6) {
        media(type: MANGA, genre: "Hentai", sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { large medium } chapters format
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
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
            if (data.data.trendingManga) renderCardsGrid('manga-trending-grid', data.data.trendingManga.media, true);
            if (data.data.hentaiAnime) renderHentaiGrid('hentai-anime-grid', data.data.hentaiAnime.media, false);
            if (data.data.hentaiManga) renderHentaiGrid('hentai-manga-grid', data.data.hentaiManga.media, true);
        }
    } catch (err) {
        console.error("Home page loading error:", err);
    }

    loadGenreAnime('Action');
    loadGenreManga('Action');
}

function setupHeroCarousel(seasonName) {
    if (!heroList || heroList.length === 0) return;
    heroIndex = 0;
    
    const slider = document.getElementById('hero-roulette-slider');
    slider.max = heroList.length;
    slider.value = 1;

    renderHeroSlide(heroIndex, seasonName);
    restartHeroTimer();
}

function onRouletteSlide(val) {
    const idx = parseInt(val) - 1;
    if (idx >= 0 && idx < heroList.length) {
        heroIndex = idx;
        const seasonObj = getCurrentSeasonObj();
        renderHeroSlide(heroIndex, seasonObj.nameRu);
        restartHeroTimer();
    }
}

function nextHeroSlide() {
    if (heroList.length === 0) return;
    heroIndex = (heroIndex + 1) % heroList.length;
    const seasonObj = getCurrentSeasonObj();
    renderHeroSlide(heroIndex, seasonObj.nameRu);
    restartHeroTimer();
}

function prevHeroSlide() {
    if (heroList.length === 0) return;
    heroIndex = (heroIndex - 1 + heroList.length) % heroList.length;
    const seasonObj = getCurrentSeasonObj();
    renderHeroSlide(heroIndex, seasonObj.nameRu);
    restartHeroTimer();
}

function renderHeroSlide(idx, seasonName) {
    const anime = heroList[idx];
    if (!anime) return;

    const bgLayer = document.getElementById('hero-bg-layer');
    const title = anime.title.english || anime.title.romaji;
    const bgImage = anime.bannerImage || anime.coverImage.extraLarge || anime.coverImage.large;

    bgLayer.classList.remove('hero-slide-fade-in');
    bgLayer.classList.add('hero-slide-fade-out');

    setTimeout(() => {
        bgLayer.style.backgroundImage = `url('${bgImage}')`;
        document.getElementById('hero-title').innerText = title;
        document.getElementById('hero-season-badge').innerText = seasonName || 'Сезон';
        document.getElementById('hero-genre').innerText = anime.genres ? anime.genres.slice(0, 2).join(' • ') : 'Аниме';
        
        const totalEp = anime.episodes ? anime.episodes : '?';
        let currentEp = totalEp;
        if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode) {
            currentEp = anime.nextAiringEpisode.episode - 1;
        }
        document.getElementById('hero-episodes-progress').innerText = `Вышло: ${currentEp} / ${totalEp} эп.`;

        if (anime.startDate && anime.startDate.day && anime.startDate.month) {
            const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
            document.getElementById('hero-release-date').innerText = `Старт: ${anime.startDate.day} ${months[anime.startDate.month - 1]} ${anime.startDate.year || ''}`;
        } else {
            document.getElementById('hero-release-date').innerText = 'Старт: Скоро';
        }

        let desc = anime.description || 'Описание отсутствует';
        desc = desc.replace(/<[^>]*>?/gm, '');
        document.getElementById('hero-desc').innerText = desc;

        const rateBtn = document.getElementById('hero-rate-btn');
        rateBtn.onclick = (e) => {
            triggerBouncyAnimation(rateBtn);
            selectAnime(anime);
        };

        bgLayer.classList.remove('hero-slide-fade-out');
        bgLayer.classList.add('hero-slide-fade-in');
    }, 250);

    document.getElementById('hero-roulette-counter').innerText = `${idx + 1} / ${heroList.length}`;
    document.getElementById('hero-roulette-slider').value = idx + 1;
}

function restartHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
        if (heroList.length > 0) {
            heroIndex = (heroIndex + 1) % heroList.length;
            const seasonObj = getCurrentSeasonObj();
            renderHeroSlide(heroIndex, seasonObj.nameRu);
        }
    }, 6000);
}

function renderCardsGrid(containerId, list, isManga = false) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = '';

    list.forEach(item => {
        const title = item.title.english || item.title.romaji;
        const cover = item.coverImage.large || item.coverImage.medium;
        const subText = isManga 
            ? (item.chapters ? `${item.chapters} гл.` : 'Манга')
            : `${item.seasonYear || ''} ${item.format || ''}`;

        const card = document.createElement('div');
        card.className = 'bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-[#3DB4F2] transition group cursor-pointer flex flex-col justify-between shadow-md';
        card.onclick = () => selectAnime(item);

        const coverClass = isManga ? 'manga-book-cover' : '';

        card.innerHTML = `
            <div class="relative overflow-hidden aspect-[3/4] ${coverClass}">
                <img src="${cover}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
            </div>
            <div class="p-2 space-y-1">
                <h4 class="text-xs font-bold text-white truncate leading-snug group-hover:text-[#3DB4F2] transition">${title}</h4>
                <p class="text-[10px] text-[#9FADBD]">${subText}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderHentaiGrid(containerId, list, isManga = false) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = '';

    list.forEach(item => {
        const title = item.title.english || item.title.romaji;
        const cover = item.coverImage.large || item.coverImage.medium;

        const card = document.createElement('div');
        card.className = 'nsfw-card bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-rose-500/80 transition group cursor-pointer flex flex-col justify-between shadow-md relative';
        card.onclick = () => selectAnime(item);

        const coverClass = isManga ? 'manga-book-cover' : '';

        card.innerHTML = `
            <div class="relative overflow-hidden aspect-[3/4] ${coverClass}">
                <img src="${cover}" class="w-full h-full object-cover">
                <div class="nsfw-mask absolute inset-0 bg-[#0B1622]/80 flex flex-col items-center justify-center p-2 text-center z-20">
                    <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-rubik-black text-[10px] shadow">18+</span>
                    <span class="text-[9px] text-white/90 font-bold mt-1">Наведите для просмотра</span>
                </div>
            </div>
            <div class="p-2 space-y-1">
                <h4 class="text-xs font-bold text-white truncate leading-snug group-hover:text-rose-400 transition">${title}</h4>
                <p class="text-[10px] text-[#9FADBD]">${isManga ? 'Хентай-манга' : '18+ Аниме'}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function loadGenreAnime(genre, btnElem) {
    if (btnElem) {
        triggerBouncyAnimation(btnElem);
        document.querySelectorAll('.genre-tab-btn').forEach(btn => {
            btn.className = 'bouncy-chip genre-tab-btn px-3 py-1.5 rounded-xl bg-[#151F2E] border border-[#2A3A4E] text-[#9FADBD] hover:border-[#3DB4F2]/50 text-xs font-bold shrink-0 transition';
        });
        btnElem.className = 'bouncy-chip genre-tab-btn px-3 py-1.5 rounded-xl bg-[#3DB4F2]/20 border border-[#3DB4F2] text-[#3DB4F2] text-xs font-bold shrink-0 transition';
    }

    const query = `
    query ($genre: String) {
      Page(perPage: 6) {
        media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { large medium } episodes seasonYear format source genres
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
    }
    `;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { genre } })
        });
        const data = await res.json();
        if (data.data && data.data.Page) {
            renderCardsGrid('genre-grid', data.data.Page.media, false);
        }
    } catch (err) {
        console.error("Genre anime loading error:", err);
    }
}

async function loadGenreManga(genre, btnElem) {
    if (btnElem) {
        triggerBouncyAnimation(btnElem);
        document.querySelectorAll('.manga-genre-tab-btn').forEach(btn => {
            btn.className = 'bouncy-chip manga-genre-tab-btn px-3 py-1.5 rounded-xl bg-[#151F2E] border border-[#2A3A4E] text-[#9FADBD] hover:border-[#3DB4F2]/50 text-xs font-bold shrink-0 transition';
        });
        btnElem.className = 'bouncy-chip manga-genre-tab-btn px-3 py-1.5 rounded-xl bg-[#3DB4F2]/20 border border-[#3DB4F2] text-[#3DB4F2] text-xs font-bold shrink-0 transition';
    }

    const query = `
    query ($genre: String) {
      Page(perPage: 6) {
        media(type: MANGA, genre: $genre, sort: POPULARITY_DESC) {
          id type title { english romaji native } coverImage { large medium } chapters format source genres
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
        }
      }
    }
    `;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { genre } })
        });
        const data = await res.json();
        if (data.data && data.data.Page) {
            renderCardsGrid('manga-genre-grid', data.data.Page.media, true);
        }
    } catch (err) {
        console.error("Genre manga loading error:", err);
    }
}

function showHomePage() {
    currentAnime = null;
    document.getElementById('rating-card').classList.add('hidden');
    document.getElementById('random-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showRandomPage() {
    currentAnime = null;
    document.getElementById('rating-card').classList.add('hidden');
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('random-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setRandomMediaType(type) {
    randomMediaType = type;
    const btnAnime = document.getElementById('rand-type-anime');
    const btnManga = document.getElementById('rand-type-manga');

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
    disc.style.transform = `rotate(${currentWheelRotation}deg)`;

    const yearStart = parseInt(document.getElementById('rand-year-start').value) || null;
    const yearEnd = parseInt(document.getElementById('rand-year-end').value) || null;
    const genre = document.getElementById('rand-genre').value || null;
    const scoreMin = parseInt(document.getElementById('rand-score-min').value);
    const scoreMax = parseInt(document.getElementById('rand-score-max').value);
    const count = parseInt(document.getElementById('rand-count').value) || 1;

    const hasNarrowFilter = !!(yearStart || yearEnd || !isNaN(scoreMin) || !isNaN(scoreMax) || genre);

    let variables = {
        page: hasNarrowFilter ? 1 : Math.floor(Math.random() * 8) + 1,
        perPage: 50,
        type: randomMediaType
    };

    let queryArgs = ['$page: Int', '$perPage: Int', '$type: MediaType'];
    let mediaArgs = ['type: $type', 'sort: POPULARITY_DESC'];

    if (genre) { queryArgs.push('$genre: String'); mediaArgs.push('genre:$genre'); variables.genre = genre; }
    if (yearStart) { queryArgs.push('$yearStart: Int'); mediaArgs.push('startDate_greater:$yearStart'); variables.yearStart = yearStart * 10000; }
    if (yearEnd) { queryArgs.push('$yearEnd: Int'); mediaArgs.push('startDate_lesser:$yearEnd'); variables.yearEnd = (yearEnd + 1) * 10000; }
    if (!isNaN(scoreMin)) { queryArgs.push('$scoreMin: Int'); mediaArgs.push('averageScore_greater:$scoreMin'); variables.scoreMin = scoreMin - 1; }
    if (!isNaN(scoreMax)) { queryArgs.push('$scoreMax: Int'); mediaArgs.push('averageScore_lesser:$scoreMax'); variables.scoreMax = scoreMax + 1; }

    const query = `
    query (${queryArgs.join(', ')}) {
      Page(page: $page, perPage: $perPage) {
        media(${mediaArgs.join(', ')}) {
          id type title { english romaji native } coverImage { extraLarge large medium } description episodes chapters seasonYear format source genres averageScore
          relations { edges { relationType node { id type title { english romaji } coverImage { medium large } } } }
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
            let list = data.data.Page.media;
            list.sort(() => Math.random() - 0.5);
            const selectedList = list.slice(0, count);

            setTimeout(() => {
                renderRandomResults(selectedList);
            }, 1200);
        }
    } catch (err) {
        console.error("Random Roll Error:", err);
        showToast('Ошибка рандомайзера');
    }
}

function renderRandomResults(list) {
    const containerSection = document.getElementById('random-results-section');
    const grid = document.getElementById('random-results-grid');
    grid.innerHTML = '';

    if (!list || list.length === 0) {
        showToast('Нет тайтлов с такими фильтрами');
        containerSection.classList.add('hidden');
        return;
    }

    list.forEach(item => {
        const title = item.title.english || item.title.romaji;
        const cover = item.coverImage.large || item.coverImage.medium;
        const sub = item.type === 'MANGA'
            ? (item.chapters ? `${item.chapters} гл.` : 'Манга')
            : `${item.seasonYear || ''} • ${item.episodes || '?'} сер.`;

        const card = document.createElement('div');
        card.className = 'bg-[#151F2E] rounded-xl overflow-hidden border border-[#2A3A4E] hover:border-[#3DB4F2] transition p-2.5 flex items-center gap-3 shadow-md';
        
        card.innerHTML = `
            <img src="${cover}" class="w-16 h-22 object-cover rounded-lg shrink-0 shadow">
            <div class="flex-1 min-w-0 space-y-1">
                <h4 class="text-xs font-bold text-white truncate">${title}</h4>
                <p class="text-[10px] text-[#9FADBD]">${sub}</p>
                <div class="flex items-center gap-1">
                    <span class="px-1.5 py-0.5 rounded bg-[#3DB4F2]/10 text-[#3DB4F2] text-[9px] font-bold">${item.averageScore || 0}% ★</span>
                </div>
                <button class="bouncy-chip mt-1 px-3 py-1 rounded-lg bg-[#3DB4F2] hover:bg-[#02A9FF] text-[#0B1622] font-bold text-[10px] transition flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">star</span> Оценить
                </button>
            </div>
        `;

        card.querySelector('button').onclick = () => selectAnime(item);
        grid.appendChild(card);
    });

    containerSection.classList.remove('hidden');
    containerSection.scrollIntoView({ behavior: 'smooth' });
}

function updateSliders() {
    const c = parseInt(document.getElementById('slider-content').value);
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
    const score90 = Math.round((sum / 50) * 90);
    document.getElementById('score-90-value').innerText = score90;
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
        btn.classList.remove('cartoon-squish');
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
    if (!currentAnime) return;

    const c = parseInt(document.getElementById('slider-content').value);
    const ch = parseInt(document.getElementById('slider-characters').value);
    const v = parseInt(document.getElementById('slider-visuals').value);
    const a = parseInt(document.getElementById('slider-audio').value);
    const af = parseInt(document.getElementById('slider-aftertaste').value);
    const sum = c + ch + v + a + af;
    const score90 = Math.round((sum / 50) * 90);

    const ratingRecord = {
        id: currentAnime.id,
        type: currentAnime.type || 'ANIME',
        title: currentAnime.title.english || currentAnime.title.romaji || 'Media',
        cover: (currentAnime.coverImage && (currentAnime.coverImage.medium || currentAnime.coverImage.large)) || '',
        sliders: { content: c, characters: ch, visuals: v, audio: a, aftertaste: af },
        strongPoint: selectedStrongPoint,
        score90: score90,
        date: new Date().toLocaleDateString()
    };

    const existingIndex = savedRatings.findIndex(r => r.id === currentAnime.id && r.type === ratingRecord.type);
    if (existingIndex >= 0) {
        savedRatings[existingIndex] = ratingRecord;
    } else {
        savedRatings.unshift(ratingRecord);
    }

    localStorage.setItem('anirate_saved_ratings', JSON.stringify(savedRatings));
    updateSavedCount();
    showToast('Оценка сохранена');
}

function updateSavedCount() {
    document.getElementById('saved-count-badge').innerText = savedRatings.length;
    document.getElementById('drawer-subtitle').innerText = `${savedRatings.length} элементов`;
}

function toggleSavedDrawer() {
    const drawer = document.getElementById('saved-drawer');
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) {
        renderSavedList();
    }
}

function switchDrawerTab(type) {
    currentDrawerTab = type;
    const btnAnime = document.getElementById('drawer-tab-anime');
    const btnManga = document.getElementById('drawer-tab-manga');

    if (type === 'ANIME') {
        btnAnime.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622] transition';
        btnManga.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-[#9FADBD] hover:text-white transition';
    } else {
        btnManga.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-[#3DB4F2] text-[#0B1622] transition';
        btnAnime.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-[#9FADBD] hover:text-white transition';
    }

    renderSavedList();
}

function renderSavedList() {
    const container = document.getElementById('saved-list-container');
    container.innerHTML = '';

    const filtered = savedRatings.filter(r => (r.type || 'ANIME') === currentDrawerTab);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-[#9FADBD] space-y-1">
                <span class="material-symbols-outlined text-3xl">bookmark_border</span>
                <p class="text-xs">Список ${currentDrawerTab === 'ANIME' ? 'анимированных' : 'манга'} оценок пуст</p>
            </div>
        `;
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
            <button onclick="removeSavedRating(${originalIndex})" class="w-7 h-7 rounded-lg hover:bg-red-500/20 text-[#9FADBD] hover:text-red-400 flex items-center justify-center transition">
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
    document.getElementById('toast-text').innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2200);
}
