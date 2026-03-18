console.log("Скрипт coming-soon.js загружен.");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM для 'Скоро в кино' загружен. Начинаю запрос к API...");
    const moviesGrid = document.getElementById('coming-soon-movies-list');
    
    if (!moviesGrid) {
        console.error("ОШИБКА: Элемент с id 'coming-soon-movies-list' не найден в HTML!");
        return;
    }

    try {
        const response = await fetch('/api/coming-soon-movies'); // Запрос к новому API
        const movies = await response.json();
        console.log("Данные 'Скоро в кино' получены:", movies);

        moviesGrid.innerHTML = ''; // Очищаем всё перед выводом

        if (movies.length === 0) {
            moviesGrid.innerHTML = '<p>Пока нет информации о будущих фильмах.</p>';
            return;
        }

        movies.forEach(movie => {
            const movieCard = document.createElement('div');
            movieCard.className = 'movie-card';

            // Используем постер из базы или заглушку
            const posterStyle = movie.poster_url ? `style="background-image: url('${movie.poster_url}'); background-size: cover; background-position: center;"` : '';

            movieCard.innerHTML = `
                <div class="movie-poster" ${posterStyle}>
                    ${!movie.poster_url ? 'Постер отсутствует' : ''}
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${movie.title}</h3>
                    <p class="movie-genre">${movie.genre ? movie.genre + ' •' : ''} ${movie.duration ? movie.duration + ' мин.' : ''}</p>
                    <!-- Здесь нет кнопок сеансов, только информация о фильме -->
                    <button class="btn-book">Подробнее</button>
                </div>
            `;
            moviesGrid.appendChild(movieCard);
        });
        console.log("Отрисовка фильмов 'Скоро в кино' завершена успешно.");

    } catch (error) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА при загрузке "Скоро в кино":', error);
        moviesGrid.innerHTML = '<p style="color: red;">Ошибка при загрузке списка фильмов. Проверьте консоль (F12).</p>';
    }
});
