const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const forecastWindows = import(`data:text/javascript;base64,${Buffer.from(readFileSync(path.join(__dirname, 'forecast-windows.js'))).toString('base64')}`);

test('forecast windows stay separate when safe hours are not contiguous', async () => {
    const { describeForecastWindows, sprayLevel } = await forecastWindows;
    const hours = [
        { hour: '08', temp: 16, wind: 1 },
        { hour: '09', temp: 16, wind: 1 },
        { hour: '10', temp: 3, wind: 1 },
        { hour: '11', temp: 18, wind: 1 },
        { hour: '12', temp: 18, wind: 4 },
        { hour: '13', temp: 18, wind: 1 }
    ].map((row) => ({ ...row, level: sprayLevel(row.temp, row.wind) }));
    const described = describeForecastWindows(hours);
    assert.deepEqual(described.spray, ['08:00–09:00', '11:00', '13:00']);
    assert.deepEqual(described.flight, ['08:00–09:00', '11:00–13:00']);
    assert.match(described.caption, /Postrek: 08:00–09:00, 11:00, 13:00/);
    assert.match(described.caption, /Let včiel: 08:00–09:00, 11:00–13:00/);
});
