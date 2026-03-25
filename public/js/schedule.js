document.addEventListener('DOMContentLoaded', async () => {
    const scheduleList = document.getElementById('schedule-list');

    try {
        const response = await fetch('/api/schedule');
        const sessions = await response.json();

        scheduleList.innerHTML = '';

        if (sessions.length === 0) {
            scheduleList.innerHTML = '<p>На сегодня сеансов больше нет.</p>';
            return;
        }

        sessions.forEach(session => {
            // Берем только время "18:30"
            const timeString = session.start_time.split(' ')[1].substring(0, 5); 

            const sessionCard = document.createElement('div');
            sessionCard.className = 'session-list-item'; // Тот самый скругленный квадрат

            sessionCard.innerHTML = `
                <!-- Время по центру слева -->
                <div class="session-time">${timeString}</div>
                
                <!-- Информация по центру (название сверху, детали снизу) -->
                <div class="session-info">
                    <h3 class="session-movie-title">${session.title}</h3>
                    <div class="session-meta">
                        <span class="session-genre">${session.genre}</span>
                        ${session.age_rating ? `<span class="session-age">${session.age_rating}</span>` : ''}
                        <span>Зал: ${session.hall_name}</span>
                        <span class="session-price">${session.price} руб</span>
                    </div>
                </div>
                
                <!-- Кнопка справа -->
                <div class="session-action">
                    <button class="btn-book-session" onclick="window.location.href='/movie?id=${session.movie_id}'">Подробнее</button>
                </div>
            `;

            scheduleList.appendChild(sessionCard);
        });

    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        scheduleList.innerHTML = '<p style="color: red;">Ошибка при загрузке расписания.</p>';
    }
});

