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
            const date = new Date(session.start_time);
            const timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            // Форматируем дату для отображения (например, "15 мая")
            const dateString = date.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' });

            const sessionCard = document.createElement('div');
            sessionCard.className = 'session-list-item';

            sessionCard.innerHTML = `
                <div class="session-poster" style="background-image: url('${session.poster_url}')"></div>
                
                <div class="session-info">
                    <h3 class="session-movie-title">${session.title}</h3>
                    <div class="session-meta">
                        <span class="session-genre">${session.genre}</span>
                        ${session.age_rating ? `<span class="session-age">${session.age_rating}</span>` : ''}
                    </div>
                    <div class="session-details">
                        <span>📍 ${session.hall_name}</span>
                        <span>💵 ${session.price} ₽</span>
                    </div>
                </div>
                
                <div class="session-time-block">
                    <div class="session-date">${dateString}</div>
                    <div class="session-time">${timeString}</div>
                    <button class="btn-book-session" data-id="${session.session_id}">Выбрать места</button>
                </div>
            `;

            scheduleList.appendChild(sessionCard);
        });

    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        scheduleList.innerHTML = '<p style="color: red;">Ошибка при загрузке расписания.</p>';
    }
});
