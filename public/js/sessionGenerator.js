const cron = require('node-cron');

async function generateSessionsForDate(targetDate) {
    // targetDate — это объект Date, на который мы создаем расписание (например, сегодня + 7 дней)
    try {
        const [movies] = await pool.query('SELECT id FROM movies WHERE is_active = true');
        
        const times = ['10:00', '13:00', '16:00', '19:00', '22:00'];
        
        for (const movie of movies) {
            for (const time of times) {
                // Собираем полную дату и время
                const startDateTime = new Date(targetDate);
                const [hours, minutes] = time.split(':');
                startDateTime.setHours(hours, minutes, 0, 0);

                // Добавляем сеанс, если такого еще нет (защита от дублей)
                await pool.query(
                    'INSERT INTO sessions (movie_id, start_time) VALUES (?, ?)',
                    [movie.id, startDateTime]
                );
            }
        }
        console.log(`[Cron] Сеансы на ${targetDate.toLocaleDateString()} успешно созданы.`);
    } catch (err) {
        console.error('[Cron] Ошибка генерации сеансов:', err);
    }
}

// Запуск каждый день в 00:00
cron.schedule('0 0 * * *', () => {
    console.log('Запуск ежедневной генерации сеансов...');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // Создаем сеансы на 7 дней вперед
    generateSessionsForDate(futureDate);
});