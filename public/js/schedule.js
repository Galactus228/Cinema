document.addEventListener('DOMContentLoaded', () => {
    const scheduleList = document.getElementById('schedule-list');
    const dateSelector = document.getElementById('date-selector');
    const params = new URLSearchParams(window.location.search);
    const filterMovieId = params.get('movieId');

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

            if (sessions.length === 0) {
                scheduleList.innerHTML = '<p class="no-sessions">На этот день сеансов нет.</p>';
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
                        <button class="btn-book-session" onclick="window.location.href='/booking?sessionId=${session.session_id}'">
                            Выбрать места
                        </button>
                    </div>
                `;
                scheduleList.appendChild(card);
            });
        } catch (error) {
            console.error('Ошибка:', error);
            scheduleList.innerHTML = '<p style="color: red;">Ошибка загрузки.</p>';
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

