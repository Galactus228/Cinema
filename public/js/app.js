console.log("Скрипт app.js загружен и начал работу");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM полностью загружен. Начинаю запрос к API...");
    const moviesGrid = document.getElementById('movies-list');
    
    if (!moviesGrid) {
        console.error("ОШИБКА: Элемент с id 'movies-list' не найден в HTML!");
        return;
    }

    try {
        // ВАЖНО: используем путь /api/schedule, который выдает ваш JSON
        const response = await fetch('/api/now-playing');
        const movies = await response.json();
        console.log("Данные от API получены:", movies);

        moviesGrid.innerHTML = ''; // Очищаем всё перед выводом

        if (movies.length === 0) {
            moviesGrid.innerHTML = '<p>Сеансов на сегодня больше нет.</p>';
            return;
        }

        movies.forEach(movie => {
            const movieCard = document.createElement('div');
            movieCard.className = 'movie-card';

            const sessionsHtml = movie.sessions.map(s => {
                const date = new Date(s.time);
                const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                return `<button class="btn-session" title="${s.hall}">${time}</button>`;
            }).join('');

            // Используем постер из базы или заглушку
            const posterStyle = movie.poster ? `style="background-image: url('${movie.poster}'); background-size: cover; background-position: center;"` : '';

            movieCard.innerHTML = `
                <div class="movie-poster" ${posterStyle}>
                    ${!movie.poster ? 'Постер отсутствует' : ''}
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${movie.title}</h3>
                    <p class="movie-genre">${movie.genre} • ${movie.duration} мин.</p>
                    <div class="sessions-list">
                        ${sessionsHtml}
                    </div>
                    <button class="btn-book" onclick="window.location.href='/movie?id=${movie.id}'">Подробнее</button>
                </div>
            `;
            moviesGrid.appendChild(movieCard);
        });
        console.log("Отрисовка фильмов завершена успешно");

    } catch (error) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА:', error);
        moviesGrid.innerHTML = '<p style="color: red;">Ошибка при загрузке афиши. Проверьте консоль (F12).</p>';
    }
});


