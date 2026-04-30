document.addEventListener('DOMContentLoaded', () => {
    const scheduleList = document.getElementById('schedule-list');
    const dateSelector = document.getElementById('date-selector');
    const params = new URLSearchParams(window.location.search);
    const filterMovieId = params.get('movieId');

    // Ссылка на изображение для "пустого" состояния
    const EMPTY_IMAGE_URL = 'https://cdn-icons-png.flaticon.com/512/4076/4076402.png';

    // По умолчанию выбрана сегодняшняя дата
    let selectedDate = new Date().toISOString().split('T')[0];

    async function loadSchedule(date) {
        try {
            scheduleList.innerHTML = '<p>Загрузка расписания...</p>';
            
            const response = await fetch(`/api/schedule?date=${date}`);
            let sessions = await response.json();

            // Если пришел не массив (ошибка сервера), делаем его пустым
            if (!Array.isArray(sessions)) sessions = [];

            if (filterMovieId) {
                sessions = sessions.filter(s => s.movie_id == filterMovieId);
            }

            scheduleList.innerHTML = '';

            // ПРОВЕРКА НА ПУСТОЕ РАСПИСАНИЕ
            if (sessions.length === 0) {
                const emptyContainer = document.createElement('div');
                emptyContainer.className = 'empty-schedule-state'; 
                emptyContainer.innerHTML = `
                    <div style="text-align: center; padding: 50px 20px;">
                        <img src="${EMPTY_IMAGE_URL}" alt="Сеансов нет" 
                             style="width: 160px; opacity: 0.5; filter: grayscale(1); margin-bottom: 20px;">
                        <p class="no-sessions" style="font-size: 1.2rem; color: var(--text-muted, #888); font-weight: 600;">
                            На выбранную дату сеансов нет
                        </p>
                    </div>
                `;
                scheduleList.appendChild(emptyContainer);
                return;
            }

            sessions.forEach(session => {
                // Извлекаем только время HH:MM
                const timeString = session.start_time.includes('T') 
                    ? session.start_time.split('T')[1].substring(0, 5)
                    : session.start_time.split(' ')[1].substring(0, 5);

                const card = document.createElement('div');
                card.className = 'session-list-item';
                card.innerHTML = `
                    <div class="session-time">${timeString}</div>
                    <div class="session-info">
                        <h3 class="session-movie-title">${session.title}</h3>
                        <div class="session-meta">
                            <span class="session-genre">${session.genre}</span>
                            <span>Зал: ${session.hall_name}</span>
                            <span class="session-price">${session.price} руб</span>
                        </div>
                    </div>
                    <div class="session-action">
                        <!-- ВЕРНУЛ СТАРЫЙ РОУТ ПО ТВОЕЙ ПРОСЬБЕ -->
                        <button class="btn-book-session" onclick="window.location.href='/booking?sessionId=${session.session_id}'">
                            Выбрать места
                        </button>
                    </div>
                `;
                scheduleList.appendChild(card);
            });
        } catch (error) {
            console.error('Ошибка:', error);
            scheduleList.innerHTML = '<p style="color: red; text-align: center;">Ошибка загрузки расписания.</p>';
        }
    }

    function renderDates() {
        if (!dateSelector) return;
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        dateSelector.innerHTML = '';

        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            const btn = document.createElement('button');
            btn.className = `date-btn ${dateStr === selectedDate ? 'active' : ''}`;
            btn.innerHTML = `<span>${days[d.getDay()]}</span>${d.getDate()}`;

            btn.onclick = () => {
                selectedDate = dateStr;
                document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadSchedule(dateStr);
            };
            dateSelector.appendChild(btn);
        }
    }

    renderDates();
    loadSchedule(selectedDate);
});

