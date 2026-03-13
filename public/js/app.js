const path = require('path');
const fastify = require('fastify')({ logger: true });

// Регистрируем плагин для отдачи статичных файлов (html, css, js)
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/', // делаем папку public корневой для URL
});

// Роут для главной страницы (отдаст index.html)
fastify.get('/', (req, reply) => {
    reply.sendFile('index.html');
});

// Пример простого API-роута
fastify.get('/api/movies', (req, reply) => {
    // Здесь будет логика получения фильмов из БД
    reply.send({ movies: [{ id: 1, title: 'Дюна: Часть вторая' }] });
});


// Запускаем сервер
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' }); // '0.0.0.0' важно для Docker
    fastify.log.info(`Сервер запущен на порту ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
document.addEventListener('DOMContentLoaded', () => {
    const moviesList = document.getElementById('movies-list');

    fetch('/api/movies')
        .then(response => response.json())
        .then(data => {
            moviesList.innerHTML = `<h2>${data.movies[0].title}</h2>`;
        })
        .catch(error => console.error('Ошибка при загрузке фильмов:', error));
});
