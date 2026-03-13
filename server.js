const path = require('path');
const fastify = require('fastify')({ logger: true });

// Эта часть нужна, чтобы ваш сайт (html, css, js) был доступен
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/', 
});

// Этот маршрут будет отдавать вашу главную страницу index.html
fastify.get('/', (req, reply) => {
    reply.sendFile('index.html');
});

// Пример API-маршрута. Позже вы будете получать данные из БД.
fastify.get('/api/movies', (req, reply) => {
    // Временный ответ-заглушка
    reply.send({ movies: [{ id: 1, title: 'Дюна: Часть вторая' }] });
});

// Функция для запуска сервера
const start = async () => {
  try {
    // '0.0.0.0' — это критически важный хост для работы внутри Docker
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info(`Сервер запущен на порту ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Запускаем!
start();
